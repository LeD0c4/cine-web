<script lang="ts">
  import {
    mdiArrowLeft, mdiPlay, mdiPause, mdiRewind10, mdiFastForward10, mdiVolumeHigh, mdiVolumeOff,
    mdiSubtitlesOutline, mdiCogOutline, mdiFullscreen, mdiFullscreenExit, mdiSkipNext, mdiCheck, mdiCast,
  } from '@mdi/js';
  import CastPicker from '../components/CastPicker.svelte';
  import Hls from 'hls.js';
  import { onDestroy } from 'svelte';
  import { jf, JF, TICKS, thumbOf, type Item, type MediaSource, type MediaStream } from '../lib/jellyfin';
  import { deviceProfile, QUALITIES } from '../lib/profile';
  import { clock, episodeCode, trackLabel } from '../lib/format';
  import { router, links } from '../lib/router.svelte';
  import { handle } from '../lib/errors';
  import { TV, native, trap } from '../lib/tv';
  import { nativeRequest } from '../lib/native';
  import { prefs } from '../lib/prefs.svelte';
  import Icon from '../components/Icon.svelte';

  let { id, start }: { id: string; start: number | null } = $props();

  let video = $state<HTMLVideoElement>(null!);
  let hls: Hls | null = null;

  let item = $state<Item | null>(null);
  let source = $state<MediaSource | null>(null);
  let playSessionId = '';
  let method = $state<'DirectPlay' | 'DirectStream' | 'Transcode'>('DirectPlay');
  let error = $state('');

  let audioIndex = $state<number | undefined>(undefined);
  let subIndex = $state(-1);
  let bitrate = $state(QUALITIES[0].bitrate);
  let forceTranscode = false;

  let time = $state(0);
  let buffered = $state(0);
  let paused = $state(true);
  let waiting = $state(true);
  let muted = $state(false);
  let volume = $state(1);
  let fullscreen = $state(false);
  let mediaDuration = $state(0);

  let controls = $state(true);
  let menu = $state<'tracks' | 'quality' | null>(null);
  let casting = $state(false);
  let flash = $state<'play' | 'pause' | 'back' | 'fwd' | null>(null);

  let segments = $state<{ Type: string; StartTicks: number; EndTicks: number }[]>([]);
  let nextEp = $state<Item | null>(null);
  let upNextDismissed = $state(false);
  let countdown = $state(5);

  let cueText = $state('');
  let subTrack: TextTrack | null = null;

  const duration = $derived(item?.RunTimeTicks ? item.RunTimeTicks / TICKS : 0);
  const streams = $derived(source?.MediaStreams ?? []);
  const audios = $derived(streams.filter((s) => s.Type === 'Audio'));
  const subs = $derived(streams.filter((s) => s.Type === 'Subtitle'));
  const title = $derived(item ? (item.Type === 'Episode' ? item.SeriesName ?? '' : item.Name) : '');
  const subtitle = $derived(item?.Type === 'Episode' ? `${episodeCode(item)} — ${item.Name}` : '');

  // ---------- Chargement ----------

  async function init() {
    try {
      const it = await jf.item(id);
      item = it;
      const startSec = start !== null ? start : (it.UserData?.PlaybackPositionTicks ?? 0) / TICKS;

      // Appli Android TV : le lecteur natif lit tout sans conversion.
      if (native) {
        native.play(nativeRequest(it, startSec * TICKS));
        router.back();
        return;
      }

      jf.segments(id).then((s) => (segments = s));
      if (it.Type === 'Episode' && it.SeriesId) {
        jf.episodes(it.SeriesId, undefined, { startItemId: it.Id, limit: 2 })
          .then((e) => (nextEp = e.find((x) => x.Id !== it.Id) ?? null))
          .catch(() => {});
      }
      await load(startSec);
    } catch (err) {
      error = handle(err);
    }
  }

  async function load(startSec: number) {
    error = '';
    waiting = true;
    destroyHls();
    const info = await jf.playbackInfo(id, {
      DeviceProfile: deviceProfile(bitrate),
      MaxStreamingBitrate: bitrate,
      StartTimeTicks: Math.round(startSec * TICKS),
      AudioStreamIndex: audioIndex,
      SubtitleStreamIndex: subIndex >= 0 && isBurnIn(subIndex) ? subIndex : undefined,
      MediaSourceId: source?.Id,
      EnableDirectPlay: !forceTranscode,
      EnableDirectStream: true,
      EnableTranscoding: true,
      AutoOpenLiveStream: true,
    });
    if (info.ErrorCode) throw new Error(`Lecture impossible (${info.ErrorCode})`);
    const src = info.MediaSources[0];
    playSessionId = info.PlaySessionId;
    const first = !source;
    source = src;
    if (first) {
      audioIndex = src.DefaultAudioStreamIndex;
      subIndex = src.DefaultSubtitleStreamIndex ?? -1;
    }

    let url: string;
    if (src.SupportsDirectPlay && !forceTranscode) {
      method = 'DirectPlay';
      url = jf.directUrl(id, src, playSessionId);
    } else if (src.TranscodingUrl) {
      method = /videocodec=copy|VideoCodec=h264&.*copy/i.test(src.TranscodingUrl) ? 'DirectStream' : 'Transcode';
      url = JF + src.TranscodingUrl;
    } else {
      throw new Error('Ce fichier ne peut pas être lu sur cet appareil.');
    }

    const hlsUrl = /\.m3u8/i.test(url);
    if (hlsUrl && !video.canPlayType('application/vnd.apple.mpegurl') && Hls.isSupported()) {
      hls = new Hls({ startPosition: startSec, maxBufferLength: 40, backBufferLength: 60 });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) error = 'La lecture a été interrompue (conversion impossible sur le serveur).';
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      video.src = url;
      video.addEventListener('loadedmetadata', () => (video.currentTime = startSec), { once: true });
    }
    video.play().catch(() => (paused = true));
    applySubtitle();
    jf.report('start', reportInfo());
  }

  function destroyHls() {
    hls?.destroy();
    hls = null;
  }

  // ---------- Sous-titres ----------

  const isBurnIn = (index: number) => streams.find((s) => s.Index === index)?.DeliveryMethod === 'Encode';

  function vttUrl(s: MediaStream) {
    if (!s.DeliveryUrl) return null;
    const u = s.DeliveryUrl.replace(/Stream\.(srt|subrip|ass|ssa)/i, 'Stream.vtt');
    return u.startsWith('http') ? u : JF + u;
  }

  /** Sous-titre texte : chargé à part et affiché par l'interface (plus lisible que le rendu du navigateur). */
  function applySubtitle() {
    for (const t of [...video.querySelectorAll('track')]) t.remove();
    subTrack = null;
    cueText = '';
    const s = streams.find((x) => x.Index === subIndex);
    if (!s || s.DeliveryMethod !== 'External') return;
    const url = vttUrl(s);
    if (!url) return;
    const el = document.createElement('track');
    el.kind = 'subtitles';
    el.src = url;
    el.srclang = s.Language ?? 'fr';
    el.default = true;
    video.appendChild(el);
    subTrack = el.track;
    subTrack.mode = 'hidden';
    subTrack.addEventListener('cuechange', () => {
      const cues = [...(subTrack?.activeCues ?? [])] as VTTCue[];
      cueText = cues.map((c) => c.text.replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '')).join('\n');
    });
  }

  async function chooseSubtitle(index: number) {
    const wasBurn = subIndex >= 0 && isBurnIn(subIndex);
    subIndex = index;
    menu = null;
    // Un sous-titre « image » (Blu-ray) doit être incrusté par le serveur : on relance au même endroit.
    if (wasBurn || (index >= 0 && isBurnIn(index))) await restart();
    else applySubtitle();
  }

  async function chooseAudio(index: number) {
    if (index === audioIndex) return;
    audioIndex = index;
    menu = null;
    // Le navigateur ne sait pas changer de piste dans un fichier : le serveur prépare la bonne.
    forceTranscode = index !== source?.DefaultAudioStreamIndex;
    await restart();
  }

  async function chooseQuality(b: number) {
    bitrate = b;
    menu = null;
    forceTranscode = b !== QUALITIES[0].bitrate || forceTranscode;
    await restart();
  }

  async function restart() {
    const at = video.currentTime;
    jf.report('stopped', reportInfo());
    try {
      await load(at);
    } catch (err) {
      error = handle(err);
    }
  }

  // ---------- Suivi de lecture (reprise, « vu ») ----------

  function reportInfo() {
    return {
      ItemId: id,
      MediaSourceId: source?.Id,
      PlaySessionId: playSessionId,
      PositionTicks: Math.round((video?.currentTime ?? 0) * TICKS),
      IsPaused: video?.paused ?? false,
      IsMuted: video?.muted ?? false,
      CanSeek: true,
      PlayMethod: method,
      AudioStreamIndex: audioIndex,
      SubtitleStreamIndex: subIndex >= 0 ? subIndex : undefined,
    };
  }

  $effect(() => {
    const t = setInterval(() => {
      if (source && !video.paused) jf.report('progress', reportInfo());
    }, 10000);
    return () => clearInterval(t);
  });

  onDestroy(() => {
    clearTimeout(hideTimer);
    if (source) jf.report('stopped', reportInfo());
    destroyHls();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  });

  $effect(() => {
    const leave = () => source && jf.report('stopped', reportInfo());
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  });

  $effect(() => {
    init();
  });

  // ---------- Commandes ----------

  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  function poke() {
    controls = true;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (video && !video.paused && !menu && !dragging) controls = false;
    }, 3500);
  }

  function toggle() {
    if (video.paused) video.play();
    else video.pause();
    flash = video.paused ? 'pause' : 'play';
    setTimeout(() => (flash = null), 500);
    poke();
  }

  function seekBy(sec: number) {
    video.currentTime = Math.max(0, Math.min(duration || video.duration, video.currentTime + sec));
    flash = sec < 0 ? 'back' : 'fwd';
    setTimeout(() => (flash = null), 500);
    jf.report('progress', reportInfo());
    poke();
  }

  function setVolume(v: number) {
    volume = Math.max(0, Math.min(1, v));
    video.volume = volume;
    video.muted = volume === 0;
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen().catch(() => {});
  }

  function exit() {
    router.back();
  }

  // Barre de progression : glisser au doigt / à la souris, flèches à la télécommande.
  let bar: HTMLDivElement;
  let dragging = $state(false);
  let preview = $state<number | null>(null);
  const total = $derived(duration || mediaDuration);
  const shown = $derived(dragging && preview !== null ? preview : time);

  function posFromEvent(e: PointerEvent) {
    const r = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * total;
  }
  function barDown(e: PointerEvent) {
    dragging = true;
    preview = posFromEvent(e);
    bar.setPointerCapture(e.pointerId);
    poke();
  }
  function barMove(e: PointerEvent) {
    if (dragging) preview = posFromEvent(e);
    else if (e.pointerType === 'mouse') preview = posFromEvent(e);
  }
  function barUp() {
    if (dragging && preview !== null) {
      video.currentTime = preview;
      jf.report('progress', reportInfo());
    }
    dragging = false;
    preview = null;
  }
  function barKey(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      seekBy(e.key === 'ArrowLeft' ? -10 : 10);
    }
  }

  // Clavier et télécommande.
  function onKey(e: KeyboardEvent) {
    const k = e.key;
    if (k === 'Escape' || k === 'Backspace' || k === 'GoBack' || k === 'BrowserBack' || k === 'GamepadB' || e.keyCode === 461) {
      e.preventDefault();
      e.stopPropagation();
      if (upNext) cancelUpNext();
      else if (menu) menu = null;
      else if (TV && controls && !video.paused) controls = false;
      else if (document.fullscreenElement && !TV) document.exitFullscreen();
      else exit();
      return;
    }
    if (k === 'MediaPlayPause' || k === 'MediaPlay' || k === 'MediaPause' || (k === ' ' && !(e.target instanceof HTMLButtonElement))) {
      e.preventDefault();
      toggle();
      return;
    }
    if (k === 'MediaFastForward') return seekBy(30);
    if (k === 'MediaRewind') return seekBy(-30);
    if (menu) return;
    if (TV) {
      // Commandes masquées : gauche/droite avancent ou reculent, OK met en pause.
      if (!controls) {
        e.preventDefault();
        e.stopPropagation();
        if (k === 'ArrowLeft') seekBy(-10);
        else if (k === 'ArrowRight') seekBy(10);
        else if (k === 'Enter') toggle();
        else poke();
        if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'Enter') queueMicrotask(() => bar?.focus());
        return;
      }
      poke();
      return;
    }
    if (e.target instanceof HTMLInputElement) return;
    switch (k.toLowerCase()) {
      case 'arrowleft': case 'j': seekBy(-10); break;
      case 'arrowright': case 'l': seekBy(10); break;
      case 'k': toggle(); break;
      case 'arrowup': setVolume(volume + 0.1); poke(); break;
      case 'arrowdown': setVolume(volume - 0.1); poke(); break;
      case 'm': video.muted = !video.muted; break;
      case 'f': toggleFullscreen(); break;
      default: return;
    }
    e.preventDefault();
  }

  // Ordres envoyés depuis un autre appareil (barre de télécommande de « Lire sur… »).
  $effect(() => {
    const onRemote = (e: Event) => {
      const { command, ticks } = (e as CustomEvent<{ command: string; ticks?: number }>).detail;
      if (command === 'Pause') video.pause();
      else if (command === 'Unpause') video.play();
      else if (command === 'PlayPause') toggle();
      else if (command === 'Stop') exit();
      else if (command === 'Seek' && ticks !== undefined) video.currentTime = ticks / TICKS;
      else if (command === 'NextTrack') playNext();
      else if (command === 'FastForward') seekBy(30);
      else if (command === 'Rewind') seekBy(-30);
      jf.report('progress', reportInfo());
    };
    window.addEventListener('selvania:remote', onRemote);
    return () => window.removeEventListener('selvania:remote', onRemote);
  });

  $effect(() => {
    window.addEventListener('keydown', onKey, true);
    const fs = () => (fullscreen = Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', fs);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('fullscreenchange', fs);
    };
  });

  // ---------- Erreur de lecture directe : on repasse par la conversion du serveur ----------
  function onVideoError() {
    if (method === 'DirectPlay' && !forceTranscode) {
      forceTranscode = true;
      restart();
    } else if (!hls) {
      error = 'Ce fichier ne peut pas être lu.';
    }
  }

  // ---------- Générique, intro, épisode suivant ----------
  const skip = $derived.by(() => {
    const t = time * TICKS;
    const s = segments.find((x) => (x.Type === 'Intro' || x.Type === 'Recap' || x.Type === 'Preview') && t >= x.StartTicks && t < x.EndTicks - 2 * TICKS);
    return s ? { label: s.Type === 'Recap' ? 'Passer le récapitulatif' : s.Type === 'Preview' ? 'Passer l’aperçu' : 'Passer l’intro', to: s.EndTicks / TICKS } : null;
  });
  const outroAt = $derived.by(() => {
    const o = segments.find((x) => x.Type === 'Outro');
    if (o) return o.StartTicks / TICKS;
    return total > 300 ? total - 25 : Infinity;
  });
  const upNext = $derived(Boolean(nextEp && !upNextDismissed && time >= outroAt));
  // Délai choisi dans les réglages (5 s par défaut) ; 0 = l'épisode suivant attend un appui.
  const delay = $derived(prefs.value.upNextDelay);

  // Le compte à rebours repart du délai complet à chaque apparition de la carte, et s'arrête en pause.
  $effect(() => {
    if (!upNext) return;
    countdown = delay;
  });
  $effect(() => {
    if (!upNext || paused || delay <= 0) return;
    const t = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(t);
        playNext();
      }
    }, 1000);
    return () => clearInterval(t);
  });

  // Intro et récapitulatif passés tout seuls si l'option est activée (une fois par passage).
  let skippedTo = -1;
  $effect(() => {
    if (!skip || !prefs.value.autoSkipIntro || skippedTo === skip.to) return;
    skippedTo = skip.to;
    video.currentTime = skip.to;
  });

  function playNext() {
    if (nextEp) router.go(links.play(nextEp.Id, true), true);
  }

  /** « Annuler » : la vidéo reprend tout l'écran, on regarde le générique jusqu'au bout. */
  function cancelUpNext() {
    upNextDismissed = true;
    poke();
  }

  function ended() {
    if (nextEp && !upNextDismissed && delay > 0) playNext();
    else if (!nextEp || upNextDismissed) exit();
    // Lecture automatique désactivée : la carte « Épisode suivant » reste affichée.
  }
</script>

<div
  class="player"
  class:hide={!controls && !menu}
  class:post={upNext}
  role="presentation"
  onpointermove={(e) => e.pointerType === 'mouse' && poke()}
  onpointerdown={poke}
>
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={video}
    bind:paused
    bind:muted
    playsinline
    preload="auto"
    poster={item ? thumbOf(item, 1280) : undefined}
    ontimeupdate={() => {
      time = video.currentTime;
      if (video.buffered.length) buffered = video.buffered.end(video.buffered.length - 1);
    }}
    ondurationchange={() => (mediaDuration = Number.isFinite(video.duration) ? video.duration : 0)}
    onwaiting={() => (waiting = true)}
    onplaying={() => (waiting = false)}
    oncanplay={() => (waiting = false)}
    onerror={onVideoError}
    onended={ended}
    onclick={() => (upNext ? cancelUpNext() : TV ? null : toggle())}
    ondblclick={toggleFullscreen}
  ></video>

  {#if cueText}
    <div class="cue" class:raised={controls}>{#each cueText.split('\n') as line, i (i)}<span>{line}</span>{/each}</div>
  {/if}

  {#if waiting && !error}<div class="center"><div class="spinner"></div></div>{/if}
  {#if flash}
    <div class="center flash" class:side-l={flash === 'back'} class:side-r={flash === 'fwd'}>
      <Icon path={flash === 'play' ? mdiPlay : flash === 'pause' ? mdiPause : flash === 'back' ? mdiRewind10 : mdiFastForward10} size={3.4} />
    </div>
  {/if}
  {#if error}
    <div class="center err">
      <p>{error}</p>
      <button class="btn glass" onclick={exit} data-autofocus>Retour</button>
    </div>
  {/if}

  <!-- Haut : retour et titre -->
  <div class="top">
    <button class="ib" onclick={exit} aria-label="Retour"><Icon path={mdiArrowLeft} size={1.9} /></button>
    <div class="titles">
      <b class="ellipsis">{title}</b>
      {#if subtitle}<span class="ellipsis">{subtitle}</span>{/if}
    </div>
    {#if method !== 'DirectPlay'}<span class="chip">{method === 'Transcode' ? 'Converti' : 'Remux'}</span>{/if}
  </div>

  {#if skip}
    <button class="skip" onclick={() => { video.currentTime = skip.to; poke(); }} data-autofocus>{skip.label}</button>
  {/if}

  <!-- Générique de fin, façon Netflix : la vidéo continue en petit à gauche, l'épisode suivant à droite -->
  {#if upNext && nextEp}
    {@const th = thumbOf(nextEp, 960)}
    <div class="postplay" use:trap={cancelUpNext}>
      <span class="pp-label">{delay > 0 ? `Épisode suivant dans ${countdown} s` : 'Épisode suivant'}</span>
      {#if th}<img class="pp-thumb" src={th} alt="" />{/if}
      <b class="pp-title">{episodeCode(nextEp)} — {nextEp.Name}</b>
      {#if nextEp.Overview}<p class="pp-ov clamp-3">{nextEp.Overview}</p>{/if}
      <div class="pp-btns">
        <button class="btn gold run" onclick={playNext} data-autofocus>
          {#if delay > 0}<span class="run-fill" class:held={paused} style:width="{((delay - countdown + (paused ? 0 : 1)) / delay) * 100}%"></span>{/if}
          <Icon path={mdiPlay} size={1.3} /> Continuer
        </button>
        <button class="btn glass" onclick={cancelUpNext}>Annuler</button>
      </div>
    </div>
  {/if}

  <!-- Bas : progression et boutons -->
  <div class="bottom">
    <div class="timeline">
      <div
        class="bar"
        bind:this={bar}
        role="slider"
        tabindex="0"
        aria-label="Position"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(time)}
        data-nav-self
        onpointerdown={barDown}
        onpointermove={barMove}
        onpointerup={barUp}
        onpointerleave={() => !dragging && (preview = null)}
        onkeydown={barKey}
      >
        <span class="buf" style:width="{total ? (buffered / total) * 100 : 0}%"></span>
        <span class="fill" style:width="{total ? (shown / total) * 100 : 0}%"></span>
        <span class="knob" style:left="{total ? (shown / total) * 100 : 0}%"></span>
        {#if preview !== null}<span class="tip" style:left="{(preview / total) * 100}%">{clock(preview)}</span>{/if}
      </div>
      <span class="time">{clock(shown)} <span class="faint">/ {clock(total)}</span></span>
    </div>
    <div class="buttons">
      <button class="ib" onclick={toggle} aria-label={paused ? 'Lecture' : 'Pause'} data-autofocus><Icon path={paused ? mdiPlay : mdiPause} size={2.2} /></button>
      <button class="ib" onclick={() => seekBy(-10)} aria-label="Reculer de 10 s"><Icon path={mdiRewind10} size={1.9} /></button>
      <button class="ib" onclick={() => seekBy(10)} aria-label="Avancer de 10 s"><Icon path={mdiFastForward10} size={1.9} /></button>
      {#if !TV}
        <div class="vol">
          <button class="ib" onclick={() => (video.muted = !video.muted)} aria-label="Son"><Icon path={muted || volume === 0 ? mdiVolumeOff : mdiVolumeHigh} size={1.8} /></button>
          <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} oninput={(e) => setVolume(Number((e.target as HTMLInputElement).value))} aria-label="Volume" />
        </div>
      {/if}
      <div class="spacer"></div>
      {#if nextEp}
        <button class="ib wide" onclick={playNext}><Icon path={mdiSkipNext} size={1.8} /> <span>Épisode suivant</span></button>
      {/if}
      {#if audios.length > 1 || subs.length}
        <button class="ib" class:on={menu === 'tracks'} onclick={() => (menu = menu === 'tracks' ? null : 'tracks')} aria-label="Langues et sous-titres"><Icon path={mdiSubtitlesOutline} size={1.8} /></button>
      {/if}
      {#if !TV}
        <button class="ib" onclick={() => { video.pause(); casting = true; }} aria-label="Lire sur un autre appareil"><Icon path={mdiCast} size={1.7} /></button>
      {/if}
      <button class="ib" class:on={menu === 'quality'} onclick={() => (menu = menu === 'quality' ? null : 'quality')} aria-label="Qualité"><Icon path={mdiCogOutline} size={1.8} /></button>
      {#if !TV}
        <button class="ib" onclick={toggleFullscreen} aria-label="Plein écran"><Icon path={fullscreen ? mdiFullscreenExit : mdiFullscreen} size={1.9} /></button>
      {/if}
    </div>
  </div>

  {#if casting && item}
    <CastPicker {item} startTicks={Math.round(video.currentTime * TICKS)} onclose={() => (casting = false)} onstarted={exit} />
  {/if}

  {#if menu === 'tracks'}
    <div class="menu tracks" use:trap={() => (menu = null)}>
      {#if audios.length}
        <div class="col">
          <h3>Audio</h3>
          {#each audios as a (a.Index)}
            <button class:on={a.Index === audioIndex} onclick={() => chooseAudio(a.Index)}>
              <span class="ck">{#if a.Index === audioIndex}<Icon path={mdiCheck} size={1.1} />{/if}</span>{trackLabel(a)}
            </button>
          {/each}
        </div>
      {/if}
      <div class="col">
        <h3>Sous-titres</h3>
        <button class:on={subIndex < 0} onclick={() => chooseSubtitle(-1)}><span class="ck">{#if subIndex < 0}<Icon path={mdiCheck} size={1.1} />{/if}</span>Désactivés</button>
        {#each subs as s (s.Index)}
          <button class:on={s.Index === subIndex} onclick={() => chooseSubtitle(s.Index)}>
            <span class="ck">{#if s.Index === subIndex}<Icon path={mdiCheck} size={1.1} />{/if}</span>{trackLabel(s)}
          </button>
        {/each}
      </div>
    </div>
  {:else if menu === 'quality'}
    <div class="menu quality" use:trap={() => (menu = null)}>
      <div class="col">
        <h3>Qualité</h3>
        {#each QUALITIES as q (q.bitrate)}
          <button class:on={q.bitrate === bitrate} onclick={() => chooseQuality(q.bitrate)}>
            <span class="ck">{#if q.bitrate === bitrate}<Icon path={mdiCheck} size={1.1} />{/if}</span>{q.label}
          </button>
        {/each}
        <p class="faint small">Lecture : {method === 'DirectPlay' ? 'directe (qualité d’origine)' : method === 'DirectStream' ? 'directe, pistes réassemblées' : 'convertie par le serveur'}</p>
      </div>
    </div>
  {/if}
</div>

<style>
  .player {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: #000;
    color: #fff;
    overflow: hidden;
  }
  .player.hide {
    cursor: none;
  }
  video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }
  .top,
  .bottom {
    position: absolute;
    left: 0;
    right: 0;
    padding: 1.4rem var(--pad);
    transition: opacity 0.35s ease, transform 0.35s ease;
  }
  .top {
    top: 0;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding-top: calc(1.2rem + env(safe-area-inset-top));
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.75), transparent);
  }
  .bottom {
    bottom: 0;
    display: grid;
    gap: 0.6rem;
    padding-bottom: calc(1.2rem + env(safe-area-inset-bottom));
    background: linear-gradient(0deg, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.5) 60%, transparent);
  }
  .hide .top {
    opacity: 0;
    transform: translateY(-1rem);
    pointer-events: none;
  }
  .hide .bottom {
    opacity: 0;
    transform: translateY(1rem);
    pointer-events: none;
  }
  .titles {
    display: grid;
    min-width: 0;
    flex: 1;
  }
  .titles b {
    font-size: 1.25rem;
  }
  .titles span {
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.95rem;
  }
  .ib {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-width: 3rem;
    height: 3rem;
    padding: 0 0.4rem;
    border-radius: 0.5rem;
    color: #fff;
    transition: transform 0.15s ease, color 0.15s ease;
  }
  .ib:hover,
  .ib.on {
    color: var(--gold);
    transform: scale(1.08);
  }
  .ib.wide {
    padding: 0 0.8rem;
    font-weight: 600;
  }
  .buttons {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .spacer {
    flex: 1;
  }
  .vol {
    display: flex;
    align-items: center;
  }
  .vol input {
    width: 0;
    opacity: 0;
    accent-color: var(--gold);
    transition: width 0.2s ease, opacity 0.2s ease;
  }
  .vol:hover input,
  .vol input:focus {
    width: 6rem;
    opacity: 1;
  }
  .timeline {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .time {
    flex: none;
    font-variant-numeric: tabular-nums;
    font-size: 0.95rem;
  }
  .faint {
    color: rgba(255, 255, 255, 0.55);
  }
  .bar {
    position: relative;
    flex: 1;
    height: 1.6rem;
    cursor: pointer;
    touch-action: none;
  }
  .bar::before,
  .buf,
  .fill {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    height: 0.3rem;
    transform: translateY(-50%);
    border-radius: 1rem;
    transition: height 0.15s ease;
  }
  .bar::before {
    right: 0;
    background: rgba(255, 255, 255, 0.22);
  }
  .buf {
    background: rgba(255, 255, 255, 0.35);
  }
  .fill {
    background: var(--gold-grad);
  }
  .bar:hover::before,
  .bar:hover .buf,
  .bar:hover .fill,
  .bar:focus::before,
  .bar:focus .buf,
  .bar:focus .fill {
    height: 0.5rem;
  }
  .knob {
    position: absolute;
    top: 50%;
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 0 4px rgba(247, 160, 31, 0.45);
    transform: translate(-50%, -50%) scale(0);
    transition: transform 0.15s ease;
  }
  .bar:hover .knob,
  .bar:focus .knob {
    transform: translate(-50%, -50%) scale(1);
  }
  .bar:focus {
    outline: none;
  }
  .tip {
    position: absolute;
    bottom: 1.8rem;
    transform: translateX(-50%);
    padding: 0.25rem 0.55rem;
    border-radius: 0.3rem;
    background: rgba(15, 16, 20, 0.92);
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }
  .center {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
  }
  .flash :global(svg) {
    padding: 1.2rem;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.45);
    animation: pop 0.5s ease forwards;
  }
  .side-l {
    justify-items: start;
    padding-left: 18%;
  }
  .side-r {
    justify-items: end;
    padding-right: 18%;
  }
  @keyframes pop {
    from {
      transform: scale(0.7);
      opacity: 1;
    }
    to {
      transform: scale(1.2);
      opacity: 0;
    }
  }
  .err {
    pointer-events: auto;
    align-content: center;
    gap: 1.2rem;
    text-align: center;
    padding: 2rem;
    background: rgba(0, 0, 0, 0.6);
  }
  .cue {
    position: absolute;
    left: 5%;
    right: 5%;
    bottom: 7%;
    display: grid;
    justify-items: center;
    gap: 0.15rem;
    text-align: center;
    pointer-events: none;
    transition: bottom 0.35s ease;
  }
  .cue.raised {
    bottom: 9.5rem;
  }
  .cue span {
    padding: 0.05em 0.4em;
    font-size: clamp(1.15rem, 2.3vw, 2.3rem);
    font-weight: 600;
    line-height: 1.3;
    color: #fff;
    background: rgba(0, 0, 0, 0.45);
    border-radius: 0.2em;
    text-shadow: 0 0 4px #000, 0 2px 6px rgba(0, 0, 0, 0.9);
  }
  .skip {
    position: absolute;
    right: var(--pad);
    bottom: 9rem;
    padding: 0.9rem 1.6rem;
    border-radius: 0.4rem;
    font-weight: 700;
    font-size: 1.05rem;
    color: #fff;
    background: rgba(20, 22, 27, 0.75);
    border: 2px solid rgba(255, 255, 255, 0.6);
    backdrop-filter: blur(8px);
  }
  .skip:hover,
  .skip:focus {
    border-color: var(--gold);
    color: var(--gold);
  }
  /* ---------- Écran de fin façon Netflix ---------- */
  video {
    transform-origin: 0 50%;
    transition: transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1), border-radius 0.7s ease, box-shadow 0.7s ease;
  }
  .player.post {
    background: radial-gradient(ellipse at 75% 50%, #1d1a16 0%, #000 70%);
  }
  .post video {
    transform: translateX(var(--pad)) scale(0.46);
    border-radius: 2rem;
    box-shadow: 0 2rem 5rem rgba(0, 0, 0, 0.7);
    cursor: pointer;
  }
  .post .top,
  .post .bottom,
  .post .cue,
  .post .skip,
  .post .center {
    opacity: 0;
    pointer-events: none;
  }
  .postplay {
    position: absolute;
    right: var(--pad);
    top: 50%;
    width: min(44%, 36rem);
    display: grid;
    gap: 0.75rem;
    transform: translateY(-50%);
    animation: pp-in 0.6s ease 0.2s both;
  }
  @keyframes pp-in {
    from {
      opacity: 0;
      transform: translate(2rem, -50%);
    }
  }
  .pp-label {
    color: var(--gold);
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .pp-thumb {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: 0.6rem;
    box-shadow: 0 1rem 2.5rem rgba(0, 0, 0, 0.55);
  }
  .pp-title {
    font-size: 1.35rem;
    line-height: 1.25;
  }
  .pp-ov {
    margin: 0;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.98rem;
    line-height: 1.45;
  }
  .pp-btns {
    display: flex;
    gap: 0.6rem;
    margin-top: 0.3rem;
  }
  .run {
    position: relative;
    overflow: hidden;
    isolation: isolate;
  }
  /* Le bouton se remplit pendant le compte à rebours, comme sur Netflix. */
  .run-fill {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: -1;
    background: rgba(255, 255, 255, 0.35);
    transition: width 1s linear;
  }
  .run-fill.held {
    transition: none;
  }
  .pp-btns .btn {
    min-height: 2.9rem;
    padding: 0 1.3rem;
  }
  .menu {
    position: absolute;
    right: var(--pad);
    bottom: 7.5rem;
    display: flex;
    gap: 1rem;
    max-height: 60vh;
    padding: 1.2rem;
    border-radius: 0.7rem;
    background: rgba(16, 17, 21, 0.96);
    border: 1px solid var(--line);
    box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.6);
    animation: fade-in 0.15s ease;
  }
  .col {
    display: grid;
    align-content: start;
    gap: 0.15rem;
    min-width: 13rem;
    max-height: calc(60vh - 2.4rem);
    overflow-y: auto;
  }
  .col h3 {
    font-size: 1.05rem;
    margin: 0 0 0.5rem 0.5rem;
  }
  .col button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 0.8rem 0.55rem 0.3rem;
    border-radius: 0.4rem;
    text-align: left;
    color: rgba(255, 255, 255, 0.72);
  }
  .col button:hover,
  .col button:focus {
    background: rgba(255, 255, 255, 0.07);
    color: #fff;
  }
  .col button.on {
    color: #fff;
    font-weight: 600;
  }
  .ck {
    display: inline-grid;
    place-items: center;
    width: 1.4rem;
    color: var(--gold);
  }
  .small {
    font-size: 0.82rem;
    margin: 0.6rem 0.5rem 0;
    max-width: 14rem;
  }
  /* Téléphone en portrait : la vidéo remonte, l'épisode suivant s'affiche dessous. */
  @media (orientation: portrait) {
    .post video {
      transform: translateY(-22%) scale(0.92);
      transform-origin: 50% 50%;
    }
    .postplay {
      left: var(--pad);
      right: var(--pad);
      top: auto;
      bottom: calc(1.5rem + env(safe-area-inset-bottom));
      width: auto;
      transform: none;
      animation-name: pp-up;
    }
    .pp-thumb {
      display: none;
    }
    @keyframes pp-up {
      from {
        opacity: 0;
        transform: translateY(2rem);
      }
    }
  }
  @media (max-width: 700px) {
    .ib.wide span,
    .vol input {
      display: none;
    }
    .buttons {
      gap: 0.1rem;
    }
    .menu {
      left: 0.6rem;
      right: 0.6rem;
      flex-direction: column;
      max-height: 70vh;
      overflow-y: auto;
    }
    .pp-ov {
      display: none;
    }
    .cue.raised {
      bottom: 8rem;
    }
  }
</style>
