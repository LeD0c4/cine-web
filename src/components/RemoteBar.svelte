<script lang="ts">
  import { mdiPlay, mdiPause, mdiStop, mdiRewind30, mdiFastForward30, mdiCastConnected, mdiClose, mdiSkipNext, mdiSkipPrevious, mdiPlaylistPlay } from '@mdi/js';
  import { remote } from '../lib/remote.svelte';
  import { jf, thumbOf, TICKS, type Item } from '../lib/jellyfin';
  import { clock, duration, episodeCode } from '../lib/format';
  import { trap } from '../lib/tv';
  import Icon from './Icon.svelte';

  // Télécommande de la lecture en cours sur un autre appareil.

  const it = $derived(remote.item);
  const total = $derived(it?.RunTimeTicks ? it.RunTimeTicks / TICKS : 0);
  const th = $derived(it ? thumbOf(it, 240) : null);

  // Message (échec de lecture…) effacé au bout de quelques secondes.
  $effect(() => {
    if (!remote.notice) return;
    const t = setTimeout(() => (remote.notice = ''), 9000);
    return () => clearTimeout(t);
  });

  // « À suivre » : les titres de la file d'attente de l'appareil distant.
  let showQueue = $state(false);
  let queueItems = $state<Record<string, Item>>({});
  const current = $derived(it ? remote.queue.indexOf(it.Id) : -1);
  const upcoming = $derived(remote.queue.map((id, i) => ({ id, i })).filter((x) => x.i > current));
  const hasQueue = $derived(remote.queue.length > 1);

  $effect(() => {
    const missing = remote.queue.filter((id) => !queueItems[id]);
    if (!showQueue || !missing.length) return;
    jf.items({ ids: missing.slice(0, 80).join(','), fields: 'Overview' })
      .then((r) => {
        const next = { ...queueItems };
        for (const x of r.Items) next[x.Id] = x;
        queueItems = next;
      })
      .catch(() => {});
  });

  function seekTo(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (total) remote.command('Seek', ((e.clientX - r.left) / r.width) * total);
  }
</script>

{#if remote.notice}
  <div class="notice fade-in" class:raised={remote.target && it}>{remote.notice}</div>
{/if}
{#if remote.target && it}
  <div class="bar fade-in">
    {#if th}<img src={th} alt="" />{/if}
    <div class="info">
      <span class="on"><Icon path={mdiCastConnected} size={1} /> Sur {remote.target.name}</span>
      <b class="ellipsis">{it.Type === 'Episode' ? `${it.SeriesName} — ${it.Name}` : it.Name}</b>
      <div class="prog">
        <span class="time">{clock(remote.position)}</span>
        <button class="track" onclick={seekTo} aria-label="Position" tabindex="-1">
          <span style:width="{total ? Math.min(100, (remote.position / total) * 100) : 0}%"></span>
        </button>
        <span class="time">{clock(total)}</span>
      </div>
    </div>
    <div class="btns">
      {#if hasQueue}
        <button onclick={() => remote.command('PreviousTrack')} aria-label="Épisode précédent"><Icon path={mdiSkipPrevious} size={1.5} /></button>
      {/if}
      <button onclick={() => remote.command('Seek', remote.position - 30)} aria-label="Reculer de 30 s"><Icon path={mdiRewind30} size={1.5} /></button>
      <button class="main" onclick={() => remote.command('PlayPause')} aria-label={remote.paused ? 'Lecture' : 'Pause'}>
        <Icon path={remote.paused ? mdiPlay : mdiPause} size={1.7} />
      </button>
      <button onclick={() => remote.command('Seek', remote.position + 30)} aria-label="Avancer de 30 s"><Icon path={mdiFastForward30} size={1.5} /></button>
      {#if hasQueue}
        <button onclick={() => remote.command('NextTrack')} aria-label="Épisode suivant"><Icon path={mdiSkipNext} size={1.5} /></button>
        <button class:on={showQueue} onclick={() => (showQueue = !showQueue)} aria-label="À suivre"><Icon path={mdiPlaylistPlay} size={1.5} /></button>
      {/if}
      <button onclick={() => remote.command('Stop')} aria-label="Arrêter"><Icon path={mdiStop} size={1.5} /></button>
      <button class="x" onclick={() => remote.disconnect()} aria-label="Masquer"><Icon path={mdiClose} size={1.3} /></button>
    </div>
  </div>

  {#if showQueue}
    <div class="queue fade-in" use:trap={() => (showQueue = false)}>
      <h3>À suivre <span>{upcoming.length} titre{upcoming.length > 1 ? 's' : ''}</span></h3>
      <div class="qlist">
        {#each upcoming as q (q.id)}
          {@const x = queueItems[q.id]}
          <button class="qi" onclick={() => { remote.playFromQueue(q.i); showQueue = false; }}>
            <span class="qth">{#if x && thumbOf(x, 320)}<img src={thumbOf(x, 320)} alt="" loading="lazy" />{/if}<span class="qp"><Icon path={mdiPlay} size={1.4} /></span></span>
            <span class="qt">
              <b class="ellipsis">{x ? (x.Type === 'Episode' ? `${episodeCode(x)} — ${x.Name}` : x.Name) : '…'}</b>
              <span class="ellipsis">{x ? duration(x.RunTimeTicks) : ''}</span>
            </span>
          </button>
        {:else}
          <p class="empty">C’est le dernier titre de la file.</p>
        {/each}
      </div>
    </div>
  {/if}
{/if}

<style>
  .queue {
    position: fixed;
    left: 50%;
    bottom: calc(6.6rem + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 61;
    width: min(46rem, calc(100vw - 1.5rem));
    max-height: min(26rem, 60vh);
    display: flex;
    flex-direction: column;
    padding: 1rem;
    border-radius: 0.9rem;
    background: rgba(20, 22, 27, 0.98);
    border: 1px solid var(--line);
    box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.6);
  }
  .queue h3 {
    font-size: 1.05rem;
    margin: 0 0 0.7rem 0.2rem;
  }
  .queue h3 span {
    margin-left: 0.5rem;
    font-weight: 400;
    color: var(--text-3);
    font-size: 0.85rem;
  }
  .qlist {
    overflow-y: auto;
    display: grid;
    gap: 0.35rem;
  }
  .qi {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.4rem;
    border-radius: 0.5rem;
    text-align: left;
  }
  .qi:hover,
  .qi:focus {
    background: rgba(255, 255, 255, 0.07);
  }
  .qth {
    position: relative;
    flex: none;
    width: 7.5rem;
    aspect-ratio: 16 / 9;
    border-radius: 0.35rem;
    overflow: hidden;
    background: #1c1f25;
  }
  .qth img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .qp {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    opacity: 0;
    background: rgba(0, 0, 0, 0.4);
  }
  .qi:hover .qp,
  .qi:focus .qp {
    opacity: 1;
  }
  .qt {
    display: grid;
    min-width: 0;
    gap: 0.15rem;
  }
  .qt span {
    font-size: 0.82rem;
    color: var(--text-3);
  }
  .empty {
    color: var(--text-3);
    padding: 0.5rem;
  }
  .btns button.on {
    color: var(--gold);
  }
  .notice {
    position: fixed;
    left: 50%;
    bottom: calc(1rem + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 61;
    max-width: calc(100vw - 2rem);
    padding: 0.8rem 1.2rem;
    border-radius: 0.7rem;
    background: rgba(20, 22, 27, 0.97);
    border: 1px solid rgba(247, 160, 31, 0.5);
    color: var(--text);
    box-shadow: 0 1rem 2.5rem rgba(0, 0, 0, 0.55);
  }
  .notice.raised {
    bottom: calc(7rem + env(safe-area-inset-bottom));
  }
  .bar {
    position: fixed;
    left: 50%;
    bottom: calc(1rem + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 60;
    width: min(46rem, calc(100vw - 1.5rem));
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.7rem 0.9rem;
    border-radius: 0.9rem;
    background: rgba(20, 22, 27, 0.96);
    border: 1px solid rgba(247, 160, 31, 0.35);
    box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(12px);
  }
  img {
    width: 6.5rem;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: 0.4rem;
    flex: none;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 0.2rem;
  }
  .on {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
    color: var(--gold);
  }
  .prog {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .time {
    font-size: 0.78rem;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .track {
    flex: 1;
    height: 0.9rem;
    display: flex;
    align-items: center;
    background: linear-gradient(rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.2)) center / 100% 0.25rem no-repeat;
    border-radius: 1rem;
  }
  .track span {
    height: 0.25rem;
    border-radius: 1rem;
    background: var(--gold-grad);
  }
  .btns {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }
  .btns button {
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 50%;
    color: var(--text);
  }
  .btns button:hover {
    color: var(--gold);
  }
  .btns .main {
    width: 3rem;
    height: 3rem;
    color: #1b1104;
    background: var(--gold-grad);
  }
  .btns .main:hover {
    color: #1b1104;
    filter: brightness(1.08);
  }
  .x {
    color: var(--text-3) !important;
  }
  @media (max-width: 640px) {
    img {
      display: none;
    }
    .bar {
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .btns {
      width: 100%;
      justify-content: space-around;
    }
  }
</style>
