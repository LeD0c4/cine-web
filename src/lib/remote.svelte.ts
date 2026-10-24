// « Lire sur… » : envoyer une vidéo vers un Chromecast ou vers une appli Jellyfin ouverte
// sur un autre appareil (Xbox, télé LG, téléphone…) et la piloter depuis ici.
//
// Trois chemins :
// - « maison » : Ciné est affiché dans une page hôte (tableau de bord domotique) qui sait lire la
//   vidéo sur un Chromecast (pont postMessage « selvania:cast:* », voir plus bas) ;
// - « cast » : Chrome diffuse lui-même (ordinateur, Chrome sur Android) ;
// - « jellyfin » : une appli Jellyfin ouverte ailleurs reçoit l'ordre de lecture.
// Pour les deux premiers, le Chromecast lit l'adresse de la vidéo avec son lecteur intégré
// et Ciné déclare lui-même la progression à Jellyfin.

import { jf, DEVICE_ID, JF, absolute, TICKS, backdropOf, posterOf, type Item, type MediaSource } from './jellyfin';

export type Target =
  | { kind: 'jellyfin'; id: string; name: string; client: string }
  | { kind: 'ha'; id: string; name: string; area?: string }
  | { kind: 'cast'; name: string };

type SessionInfo = {
  Id: string;
  DeviceId: string;
  DeviceName: string;
  Client: string;
  SupportsRemoteControl: boolean;
  NowPlayingItem?: Item;
  PlayState?: { PositionTicks?: number; IsPaused?: boolean };
  NowPlayingQueue?: { Id: string; PlaylistItemId?: string }[];
};

/** Sessions du service de diffusion de la page hôte (un Chromecast de la maison). */
const HOME_CAST = 'Selvania Cast';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const cast: any;
declare const chrome: any;

/**
 * Formats lus par tous les Chromecast, y compris les anciens : H.264 jusqu'en 1080p, son AAC ou MP3.
 * Le reste (HEVC, 4K, Dolby, MKV…) est converti par Jellyfin.
 */
function castProfile() {
  return {
    Name: 'Selvania Cine Chromecast',
    MaxStreamingBitrate: 20_000_000,
    MaxStaticBitrate: 20_000_000,
    DirectPlayProfiles: [
      { Container: 'mp4,m4v', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac,mp3' },
      { Container: 'webm', Type: 'Video', VideoCodec: 'vp8', AudioCodec: 'vorbis,opus' },
    ],
    CodecProfiles: [
      {
        Type: 'Video', Codec: 'h264',
        Conditions: [
          { Condition: 'LessThanEqual', Property: 'Width', Value: '1920', IsRequired: true },
          { Condition: 'LessThanEqual', Property: 'Height', Value: '1080', IsRequired: true },
          { Condition: 'LessThanEqual', Property: 'VideoLevel', Value: '41', IsRequired: false },
          { Condition: 'LessThanEqual', Property: 'VideoBitDepth', Value: '8', IsRequired: false },
          { Condition: 'EqualsAny', Property: 'VideoProfile', Value: 'high|main|baseline|constrained baseline', IsRequired: false },
        ],
      },
    ],
    TranscodingProfiles: [
      {
        Container: 'ts', Type: 'Video', Protocol: 'hls', Context: 'Streaming',
        VideoCodec: 'h264', AudioCodec: 'aac,mp3', MaxAudioChannels: '2', MinSegments: 1, BreakOnNonKeyFrames: true,
      },
    ],
    ContainerProfiles: [],
    SubtitleProfiles: [
      { Format: 'vtt', Method: 'External' },
      { Format: 'pgssub', Method: 'Encode' },
      { Format: 'dvdsub', Method: 'Encode' },
    ],
  };
}

/** Ce qu'il faut au Chromecast : adresse de la vidéo, type, titre, image, sous-titres. */
type Prepared = {
  url: string;
  contentType: string;
  method: string;
  source: MediaSource;
  playSessionId: string;
  item: Item;
  title: string;
  image: string | null;
  subtitles: { index: number; url: string; name: string; lang?: string; isDefault: boolean }[];
};

async function prepare(item: Item, startTicks: number, forceTranscode = false): Promise<Prepared> {
  const full = item.MediaSources ? item : await jf.item(item.Id);
  const info = await jf.playbackInfo(item.Id, {
    DeviceProfile: castProfile(),
    MaxStreamingBitrate: 20_000_000,
    StartTimeTicks: startTicks,
    EnableDirectPlay: !forceTranscode,
    EnableDirectStream: !forceTranscode,
    EnableTranscoding: true,
    AutoOpenLiveStream: true,
  });
  const src = info.MediaSources[0];
  let url: string;
  let contentType: string;
  let method: string;
  if (src.SupportsDirectPlay && !forceTranscode) {
    method = 'DirectPlay';
    url = absolute(jf.directUrl(item.Id, src, info.PlaySessionId));
    contentType = src.Container?.includes('webm') ? 'video/webm' : 'video/mp4';
  } else if (src.TranscodingUrl) {
    method = 'Transcode';
    url = absolute(JF + src.TranscodingUrl);
    contentType = 'application/x-mpegurl';
  } else {
    throw new Error('Ce fichier ne peut pas être lu sur le Chromecast');
  }
  const img = backdropOf(full, 1280) ?? posterOf(full, 600);
  const subtitles = src.MediaStreams.filter((x) => x.Type === 'Subtitle' && x.DeliveryMethod === 'External' && x.DeliveryUrl).map((s) => {
    const u = s.DeliveryUrl!.replace(/Stream\.(srt|subrip|ass|ssa)/i, 'Stream.vtt');
    return {
      index: s.Index,
      url: absolute(u.startsWith('http') ? u : JF + u),
      name: s.DisplayTitle ?? s.Language ?? `Sous-titres ${s.Index}`,
      lang: s.Language,
      isDefault: s.Index === src.DefaultSubtitleStreamIndex,
    };
  });
  const title = full.Type === 'Episode' ? `${full.SeriesName} — ${full.Name}` : full.Name;
  return { url, contentType, method, source: src, playSessionId: info.PlaySessionId, item: full, title, image: img ? absolute(img) : null, subtitles };
}

// ---------- Pont avec une page hôte (Ciné affiché dans un tableau de bord) ----------

const inFrame = (() => {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
})();

/** Adresse du dashboard qui affiche Ciné : les messages (avec le jeton de lecture) ne vont qu'à lui. */
const parentOrigin = (() => {
  const anc = (location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  if (anc?.length) return anc[anc.length - 1];
  try {
    return document.referrer ? new URL(document.referrer).origin : null;
  } catch {
    return null;
  }
})();

let seq = 0;
function bridge<T = any>(msg: Record<string, unknown>, timeout = 8000): Promise<T> {
  if (!inFrame || !parentOrigin) return Promise.reject(new Error('Ciné n’est pas affiché dans le dashboard'));
  const id = ++seq;
  const type = String(msg.type);
  return new Promise<T>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener('message', on);
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error('Le dashboard ne répond pas'));
    }, timeout);
    const on = (e: MessageEvent) => {
      if (e.origin !== parentOrigin || e.data?.id !== id || e.data?.type !== `${type}:result`) return;
      done();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data as T);
    };
    window.addEventListener('message', on);
    window.top!.postMessage({ ...msg, id }, parentOrigin);
  });
}

class Remote {
  target = $state<Target | null>(null);
  item = $state<Item | null>(null);
  position = $state(0);
  paused = $state(false);
  /** Le navigateur sait diffuser vers un Chromecast (Chrome sur ordinateur ou Android). */
  castAvailable = $state(false);
  /** Message affiché quand la lecture à distance échoue. */
  notice = $state('');
  /** File d'attente de l'appareil distant (épisodes suivants…). */
  queue = $state<string[]>([]);
  /** Lectures à distance fermées par l'utilisateur : pas de réaffichage automatique. */
  private dismissed = new Set<string>();
  private watcher: ReturnType<typeof setInterval> | undefined;
  private castReady: Promise<boolean> | null = null;
  private poll: ReturnType<typeof setInterval> | undefined;

  // Lecture Chromecast en cours (pour déclarer la progression à Jellyfin)
  private player: any = null;
  private controller: any = null;
  private castPlay: {
    itemId: string; source: MediaSource; playSessionId: string; method: string; started: number; lastReport: number;
    played?: boolean; retried?: boolean; startTicks?: number;
  } | null = null;

  // ---------- Appareils ----------

  async devices(): Promise<Target[]> {
    const [home, sessions] = await Promise.all([
      inFrame
        ? bridge<{ devices: { id: string; name: string; area: string }[] }>({ type: 'selvania:cast:list' }, 2500)
            .then((r) => r.devices.map((d) => ({ kind: 'ha' as const, id: d.id, name: d.name, area: d.area })))
            .catch(() => [] as Target[])
        : Promise.resolve([] as Target[]),
      jf.get<SessionInfo[]>('/Sessions', { controllableByUserId: jf.userId, activeWithinSeconds: 1800 }),
    ]);
    const apps = sessions
      .filter((s) => s.SupportsRemoteControl && s.DeviceId !== DEVICE_ID && !/chromecast/i.test(s.Client))
      // Dans une page hôte (tableau de bord), les Chromecast de la maison sont déjà listés (via Home Assistant).
      .filter((s) => !(home.length && s.Client === HOME_CAST))
      .map((s) => ({ kind: 'jellyfin' as const, id: s.Id, name: s.DeviceName, client: s.Client === HOME_CAST ? 'Chromecast (maison)' : s.Client }));
    return [...home, ...apps];
  }

  /** Charge le kit Google Cast (seulement dans Chrome). */
  initCast() {
    if (this.castReady) return this.castReady;
    this.castReady = new Promise<boolean>((resolve) => {
      if (!/Chrome/.test(navigator.userAgent) || /SelvaniaTV|wv\)/.test(navigator.userAgent)) return resolve(false);
      (window as any).__onGCastApiAvailable = (ok: boolean) => {
        if (!ok) return resolve(false);
        cast.framework.CastContext.getInstance().setOptions({
          receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        });
        this.player = new cast.framework.RemotePlayer();
        this.controller = new cast.framework.RemotePlayerController(this.player);
        this.listenCast();
        this.castAvailable = true;
        resolve(true);
      };
      const s = document.createElement('script');
      s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
    return this.castReady;
  }

  // ---------- Lecture ----------

  async playOn(target: Target, item: Item, startTicks?: number) {
    const start = startTicks ?? item.UserData?.PlaybackPositionTicks ?? 0;
    if (target.kind === 'jellyfin') {
      await jf.post(`/Sessions/${target.id}/Playing`, undefined, { playCommand: 'PlayNow', itemIds: item.Id, startPositionTicks: start });
      this.target = target;
      this.startPolling();
    } else if (target.kind === 'ha') {
      this.notice = '';
      await this.startHome(target, item, start);
      return;
    } else {
      const ctx = cast.framework.CastContext.getInstance();
      // Ouvre le choix de l'appareil de Chrome (doit rester dans le geste de l'utilisateur).
      if (!ctx.getCurrentSession()) await ctx.requestSession();
      const session = ctx.getCurrentSession();
      if (!session) throw new Error('Aucun Chromecast choisi');
      this.target = { kind: 'cast', name: session.getCastDevice()?.friendlyName ?? 'Chromecast' };
      await this.loadOnCast(session, item, start);
    }
    this.item = item;
    this.position = start / TICKS;
    this.paused = false;
  }

  /**
   * Chromecast de la maison : le service de diffusion de la page hôte prend la main (file d'attente, épisode suivant, progression)
   * et apparaît comme un appareil Jellyfin, visible et pilotable depuis tous les appareils du compte.
   */
  private async startHome(target: { id: string; name: string }, item: Item, start: number) {
    const base = { type: 'selvania:cast:start', entity: target.id, server: absolute(JF), userId: jf.userId, itemIds: [item.Id], startTicks: start };
    let res = await bridge<{ needCode?: string; secret?: string; qcDeviceId?: string; deviceId?: string; name?: string }>(base, 30000);
    if (res.needCode) {
      // Première diffusion sur ce Chromecast : on autorise le service de diffusion avec ce compte (Quick Connect).
      await jf.post('/QuickConnect/Authorize', undefined, { code: res.needCode, userId: jf.userId });
      res = await bridge({ ...base, qcSecret: res.secret, qcDeviceId: res.qcDeviceId }, 30000);
    }
    // La session Jellyfin du Chromecast : la barre de télécommande s'y accroche.
    for (let i = 0; i < 15 && res.deviceId; i++) {
      const sessions = await jf.get<SessionInfo[]>('/Sessions', { controllableByUserId: jf.userId });
      const s = sessions.find((x) => x.DeviceId === res.deviceId);
      if (s) {
        this.attach(s);
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('Le Chromecast ne répond pas');
  }

  /**
   * « À suivre » : Jellyfin ne transmet pas toujours la file des autres appareils ;
   * pour une série, ce sont les épisodes suivants (c'est ce que lit le service de diffusion).
   */
  private queueFor = '';
  private async syncQueue(s: SessionInfo) {
    const q = (s.NowPlayingQueue ?? []).map((x) => x.Id);
    if (q.length > 1) {
      if (q.join() !== this.queue.join()) this.queue = q;
      return;
    }
    const it = s.NowPlayingItem;
    if (!it || it.Type !== 'Episode' || !it.SeriesId) {
      this.queue = it ? [it.Id] : [];
      return;
    }
    if (this.queueFor === it.Id) return;
    this.queueFor = it.Id;
    try {
      const eps = await jf.episodes(it.SeriesId, undefined, { startItemId: it.Id, limit: 40 });
      if (this.item?.Id === it.Id) this.queue = eps.map((e) => e.Id);
    } catch {
      this.queue = [it.Id];
    }
  }

  /** Affiche la barre de télécommande pour une session distante (lancée ici ou ailleurs). */
  private attach(s: SessionInfo) {
    this.target = { kind: 'jellyfin', id: s.Id, name: s.DeviceName, client: s.Client };
    if (s.NowPlayingItem) this.item = s.NowPlayingItem;
    this.position = (s.PlayState?.PositionTicks ?? 0) / TICKS;
    this.paused = Boolean(s.PlayState?.IsPaused);
    this.queueFor = '';
    this.syncQueue(s);
    this.startPolling();
  }

  /**
   * Sur tous les appareils du compte : dès qu'un Chromecast de la maison lit quelque chose,
   * la barre de télécommande apparaît (avec la suite de la file d'attente).
   */
  watch() {
    clearInterval(this.watcher);
    const look = async () => {
      if (this.target || !jf.token) return;
      try {
        const sessions = await jf.get<SessionInfo[]>('/Sessions', { controllableByUserId: jf.userId, activeWithinSeconds: 600 });
        const s = sessions.find((x) => x.Client === HOME_CAST && x.NowPlayingItem && !this.dismissed.has(`${x.Id}:${x.NowPlayingItem.Id}`));
        if (s && !this.target) this.attach(s);
      } catch {
        /* hors ligne : on réessaie */
      }
    };
    look();
    this.watcher = setInterval(look, 10000);
  }

  /** Épisode de la file choisi dans « À suivre » : lecture à partir de celui-là. */
  async playFromQueue(index: number) {
    const t = this.target;
    if (!t || t.kind !== 'jellyfin' || index < 0 || index >= this.queue.length) return;
    await jf.post(`/Sessions/${t.id}/Playing`, undefined, { playCommand: 'PlayNow', itemIds: this.queue.slice(index).join(',') });
  }

  /** Chromecast de la maison (via la page hôte). */
  private async sendToHome(target: { id: string }, item: Item, start: number, forceTranscode: boolean) {
    const p = await prepare(item, start, forceTranscode);
    const sub = p.subtitles.find((s) => s.isDefault);
    await bridge({
      type: 'selvania:cast:play',
      entity: target.id,
      url: p.url,
      contentType: p.contentType,
      title: p.title,
      thumb: p.image,
      startSeconds: start / TICKS,
      subtitles: sub?.url,
      subtitlesLang: sub?.lang,
    }, 20000);
    if (this.castPlay) this.reportCast('stopped');
    this.position = start / TICKS;
    this.paused = false;
    this.castPlay = {
      itemId: item.Id, source: p.source, playSessionId: p.playSessionId, method: p.method,
      started: Date.now(), lastReport: 0, retried: forceTranscode, startTicks: start,
    };
    this.reportCast('start');
  }

  private async loadOnCast(session: any, item: Item, startTicks: number) {
    const p = await prepare(item, startTicks);
    const full = p.item;
    const media = new chrome.cast.media.MediaInfo(p.url, p.contentType);
    media.streamType = chrome.cast.media.StreamType.BUFFERED;
    if (p.contentType === 'application/x-mpegurl') {
      media.hlsSegmentFormat = chrome.cast.media.HlsSegmentFormat.TS;
      media.hlsVideoSegmentFormat = chrome.cast.media.HlsVideoSegmentFormat.MPEG2_TS;
    }
    const isEp = full.Type === 'Episode';
    const meta = isEp ? new chrome.cast.media.TvShowMediaMetadata() : new chrome.cast.media.MovieMediaMetadata();
    meta.title = full.Name;
    if (isEp) {
      meta.seriesTitle = full.SeriesName;
      meta.season = full.ParentIndexNumber;
      meta.episode = full.IndexNumber;
    } else if (full.ProductionYear) {
      meta.subtitle = String(full.ProductionYear);
    }
    if (p.image) meta.images = [new chrome.cast.Image(p.image)];
    media.metadata = meta;

    // Sous-titres texte (WebVTT servi par Jellyfin)
    const tracks = p.subtitles.map((s) => {
      const t = new chrome.cast.media.Track(s.index + 1, chrome.cast.media.TrackType.TEXT);
      t.trackContentId = s.url;
      t.trackContentType = 'text/vtt';
      t.subtype = chrome.cast.media.TextTrackType.SUBTITLES;
      t.name = s.name;
      t.language = s.lang;
      return t;
    });
    if (tracks.length) media.tracks = tracks;

    const req = new chrome.cast.media.LoadRequest(media);
    req.autoplay = true;
    req.currentTime = startTicks / TICKS;
    const def = p.subtitles.find((s) => s.isDefault);
    if (def) req.activeTrackIds = [def.index + 1];

    this.position = startTicks / TICKS;
    this.paused = false;
    this.castPlay = { itemId: item.Id, source: p.source, playSessionId: p.playSessionId, method: p.method, started: 0, lastReport: 0 };
    await session.loadMedia(req);
    this.reportCast('start');
    this.castPlay.started = Date.now();
  }

  // ---------- Suivi Chromecast → Jellyfin ----------

  private reportCast(kind: 'start' | 'progress' | 'stopped') {
    const p = this.castPlay;
    if (!p) return;
    jf.report(kind, {
      ItemId: p.itemId,
      MediaSourceId: p.source.Id,
      PlaySessionId: p.playSessionId,
      PositionTicks: Math.round(this.position * TICKS),
      IsPaused: this.paused,
      CanSeek: true,
      PlayMethod: p.method,
    });
    p.lastReport = Date.now();
  }

  private listenCast() {
    const E = cast.framework.RemotePlayerEventType;
    this.controller.addEventListener(E.CURRENT_TIME_CHANGED, () => {
      if (this.target?.kind !== 'cast') return;
      this.position = this.player.currentTime;
      if (this.castPlay?.started && Date.now() - this.castPlay.lastReport > 10000) this.reportCast('progress');
    });
    this.controller.addEventListener(E.IS_PAUSED_CHANGED, () => {
      if (this.target?.kind !== 'cast') return;
      this.paused = this.player.isPaused;
      this.reportCast('progress');
    });
    this.controller.addEventListener(E.PLAYER_STATE_CHANGED, () => {
      // Fin du film, ou lecture arrêtée depuis la télé.
      if (this.target?.kind === 'cast' && this.castPlay?.started && this.player.playerState === null) this.endCast();
    });
    this.controller.addEventListener(E.IS_CONNECTED_CHANGED, () => {
      if (!this.player.isConnected && this.target?.kind === 'cast') this.endCast();
    });
  }

  private endCast() {
    clearInterval(this.poll);
    this.reportCast('stopped');
    this.castPlay = null;
    this.target = null;
    this.item = null;
  }

  // ---------- Télécommande ----------

  async command(cmd: 'PlayPause' | 'Stop' | 'Seek' | 'NextTrack' | 'PreviousTrack', seekSeconds?: number) {
    const t = this.target;
    if (!t) return;
    if (cmd === 'Seek') this.position = Math.max(0, seekSeconds ?? 0);
    if (t.kind === 'cast') {
      if (cmd === 'NextTrack' || cmd === 'PreviousTrack') return;
      if (cmd === 'PlayPause') this.controller.playOrPause();
      else if (cmd === 'Stop') {
        this.controller.stop();
        this.endCast();
      } else {
        this.player.currentTime = this.position;
        this.controller.seek();
      }
      return;
    }
    if (t.kind === 'ha') {
      if (cmd === 'NextTrack' || cmd === 'PreviousTrack') return;
      if (cmd === 'PlayPause') this.paused = !this.paused;
      const action = cmd === 'PlayPause' ? 'play_pause' : cmd === 'Stop' ? 'stop' : 'seek';
      await bridge({ type: 'selvania:cast:control', entity: t.id, action, position: this.position });
      if (cmd === 'Stop') this.endCast();
      else this.reportCast('progress');
      return;
    }
    if (t.kind !== 'jellyfin') return;
    if (cmd === 'PlayPause') this.paused = !this.paused;
    const name = cmd === 'PlayPause' ? (this.paused ? 'Pause' : 'Unpause') : cmd;
    await jf.post(`/Sessions/${t.id}/Playing/${name}`, undefined, cmd === 'Seek' ? { seekPositionTicks: Math.round(this.position * TICKS) } : undefined);
    if (cmd === 'Stop') this.disconnect();
  }

  disconnect() {
    clearInterval(this.poll);
    if (this.target?.kind === 'jellyfin' && this.item) this.dismissed.add(`${this.target.id}:${this.item.Id}`);
    this.queue = [];
    if (this.target?.kind === 'cast') cast.framework.CastContext.getInstance().endCurrentSession(true);
    if (this.castPlay) this.reportCast('stopped');
    this.castPlay = null;
    this.target = null;
    this.item = null;
  }

  /** Suivi de la lecture à distance : appli Jellyfin (via le serveur) ou Chromecast de la maison (via HA). */
  private startPolling() {
    clearInterval(this.poll);
    let misses = 0;
    this.poll = setInterval(async () => {
      const t = this.target;
      if (!t || !this.item) return;
      try {
        if (t.kind === 'ha') {
          const s = await bridge<{ state: string; position: number }>({ type: 'selvania:cast:state', entity: t.id });
          const cp = this.castPlay;
          const since = Date.now() - (cp?.started ?? 0);
          if ((s.state === 'playing' && s.position > 0.5) || (cp?.played && s.state === 'paused')) {
            misses = 0;
            if (cp) cp.played = true;
            this.position = s.position;
            this.paused = s.state === 'paused';
            if (Date.now() - (cp?.lastReport ?? 0) > 10000) this.reportCast('progress');
          } else if (cp && !cp.played && since > 15000) {
            // Le Chromecast n'a pas démarré (format refusé) : on relance une fois en version convertie.
            if (!cp.retried && this.item) {
              this.notice = 'Le Chromecast n’a pas lu le fichier d’origine : passage en version convertie…';
              await this.sendToHome(t, this.item, cp.startTicks ?? 0, true);
            } else {
              this.castPlay = null;
              this.endCast();
              this.notice = 'Le Chromecast n’arrive pas à lire cette vidéo.';
            }
          } else if (cp?.played && since > 20000 && ++misses > 3) {
            // Film fini ou arrêté depuis la télé.
            this.endCast();
          }
          return;
        }
        if (t.kind !== 'jellyfin') return;
        const sessions = await jf.get<SessionInfo[]>('/Sessions', { controllableByUserId: jf.userId, activeWithinSeconds: 600 });
        const s = sessions.find((x) => x.Id === t.id);
        if (s?.NowPlayingItem) {
          misses = 0;
          if (s.NowPlayingItem.Id !== this.item.Id) this.item = s.NowPlayingItem;
          this.position = (s.PlayState?.PositionTicks ?? 0) / TICKS;
          this.paused = Boolean(s.PlayState?.IsPaused);
          this.syncQueue(s);
        } else if (++misses > 10) {
          // Plus rien en lecture depuis 20 s : la lecture à distance est finie.
          this.disconnect();
        }
      } catch {
        /* réseau : on réessaie */
      }
    }, 2500);
  }
}

export const remote = new Remote();
