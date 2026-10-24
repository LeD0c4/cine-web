<script lang="ts">
  import { mdiCast, mdiMicrosoftXbox, mdiTelevision, mdiCellphone, mdiMonitor, mdiRefresh, mdiClose } from '@mdi/js';
  import type { Item } from '../lib/jellyfin';
  import { remote, type Target } from '../lib/remote.svelte';
  import { trap, native } from '../lib/tv';
  import { nativeCast, nativeRequest } from '../lib/native';
  import Icon from './Icon.svelte';

  // Choix de l'appareil : Chromecast (via Chrome) ou appli Jellyfin ouverte ailleurs (Xbox, télé…).

  let { item, startTicks, onclose, onstarted }: { item: Item; startTicks?: number; onclose: () => void; onstarted?: () => void } = $props();

  let devices = $state<Target[] | null>(null);
  let error = $state('');
  let busy = $state('');

  async function load() {
    devices = null;
    error = '';
    try {
      // Le kit Chromecast peut ne jamais répondre (navigateur sans Cast) : on n'attend pas plus de 4 s.
      const castWait = Promise.race([remote.initCast(), new Promise((r) => setTimeout(r, 4000))]);
      const [list] = await Promise.all([remote.devices(), castWait]);
      devices = list;
    } catch (e) {
      error = (e as Error).message;
      devices = [];
    }
  }
  $effect(() => {
    load();
  });

  const keyOf = (t: Target) => (t.kind === 'cast' ? 'cast' : `${t.kind}:${t.id}`);
  // Dans une page hôte (tableau de bord), les Chromecast viennent de Home Assistant : pas besoin de la diffusion de Chrome en plus.
  const homeCasts = $derived((devices ?? []).some((d) => d.kind === 'ha'));

  function iconFor(t: Target) {
    if (t.kind === 'cast' || t.kind === 'ha') return mdiCast;
    const s = `${t.name} ${t.client}`;
    if (/xbox/i.test(s)) return mdiMicrosoftXbox;
    if (/tv|webos|tizen|android ?tv|roku|fire/i.test(s)) return mdiTelevision;
    if (/android|ios|iphone|mobile/i.test(s)) return mdiCellphone;
    return mdiMonitor;
  }

  // Appli Android : diffusion intégrée (choix du Chromecast par Android, épisodes suivants en file d'attente).
  function castNative() {
    native!.cast!(nativeRequest(item, startTicks ?? item.UserData?.PlaybackPositionTicks ?? 0));
    onstarted?.();
    onclose();
  }

  async function pick(t: Target) {
    busy = keyOf(t);
    error = '';
    try {
      await remote.playOn(t, item, startTicks);
      onstarted?.();
      onclose();
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      error = /cancel/i.test(msg) ? '' : msg;
    } finally {
      busy = '';
    }
  }
</script>

<div class="backdrop" role="presentation" onclick={onclose}></div>
<div class="picker" use:trap={onclose} role="dialog" aria-label="Lire sur">
  <header>
    <h2>Lire sur…</h2>
    <button class="ib" onclick={load} aria-label="Actualiser"><Icon path={mdiRefresh} size={1.3} /></button>
    <button class="ib" onclick={onclose} aria-label="Fermer"><Icon path={mdiClose} size={1.3} /></button>
  </header>
  <p class="what ellipsis">{item.Type === 'Episode' ? `${item.SeriesName} — ${item.Name}` : item.Name}</p>

  <div class="list">
    {#if nativeCast}
      <button class="dev" onclick={castNative} data-autofocus>
        <span class="ic"><Icon path={mdiCast} size={1.5} /></span>
        <span class="t"><b>Chromecast</b><span>Choisir l’appareil de la maison</span></span>
      </button>
    {:else if remote.castAvailable && !homeCasts}
      <button class="dev" onclick={() => pick({ kind: 'cast', name: 'Chromecast' })} disabled={!!busy} data-autofocus>
        <span class="ic"><Icon path={mdiCast} size={1.5} /></span>
        <span class="t"><b>Chromecast</b><span>Choisir l’appareil de la maison</span></span>
        {#if busy === 'cast'}<span class="spinner small"></span>{/if}
      </button>
    {/if}
    {#if devices === null}
      <div class="loading"><span class="spinner small"></span> Recherche des appareils…</div>
    {:else}
      {#each devices as d, i (keyOf(d))}
        <button class="dev" onclick={() => pick(d)} disabled={!!busy} data-autofocus={i === 0 && !nativeCast && !(remote.castAvailable && !homeCasts) ? '' : undefined}>
          <span class="ic"><Icon path={iconFor(d)} size={1.5} /></span>
          <span class="t">
            <b>{d.name}</b>
            <span>{d.kind === 'jellyfin' ? `Appli ${d.client}` : d.kind === 'ha' ? ['Chromecast', d.area].filter(Boolean).join(' · ') : ''}</span>
          </span>
          {#if busy === keyOf(d)}<span class="spinner small"></span>{/if}
        </button>
      {/each}
      {#if !devices.length && !remote.castAvailable && !nativeCast}
        <p class="empty">Aucun appareil trouvé.</p>
      {/if}
    {/if}
  </div>

  {#if error}<p class="err">{error}</p>{/if}
  <p class="hint">
    Xbox, télé LG… : ouvrez l’appli <b>Jellyfin</b> sur l’appareil (connecté au même compte), puis actualisez.
    {#if !remote.castAvailable && !nativeCast}Le Chromecast s’utilise depuis Chrome (ordinateur ou téléphone Android).{/if}
  </p>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
    background: rgba(0, 0, 0, 0.55);
    animation: fade-in 0.15s ease;
  }
  .picker {
    position: fixed;
    z-index: 151;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(28rem, calc(100vw - 2rem));
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    display: grid;
    gap: 0.8rem;
    padding: 1.3rem;
    border-radius: 1rem;
    background: linear-gradient(180deg, #1c1f26, #121418);
    border: 1px solid var(--line);
    box-shadow: 0 2rem 5rem rgba(0, 0, 0, 0.6);
    animation: fade-in 0.18s ease;
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  h2 {
    flex: 1;
    font-size: 1.35rem;
  }
  .ib {
    display: grid;
    place-items: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 50%;
    color: var(--text-2);
  }
  .what {
    color: var(--gold);
    font-weight: 600;
  }
  .list {
    display: grid;
    gap: 0.4rem;
  }
  .dev {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.8rem 0.9rem;
    border-radius: 0.7rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid transparent;
    text-align: left;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .dev:hover,
  .dev:focus {
    background: rgba(255, 255, 255, 0.09);
    border-color: var(--gold);
    outline: none;
  }
  .dev:disabled {
    opacity: 0.6;
  }
  .ic {
    display: grid;
    place-items: center;
    width: 2.8rem;
    height: 2.8rem;
    border-radius: 0.6rem;
    color: #1b1104;
    background: var(--gold-grad);
  }
  .t {
    flex: 1;
    display: grid;
    min-width: 0;
  }
  .t span {
    font-size: 0.85rem;
    color: var(--text-3);
  }
  .loading,
  .empty {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.8rem 0.2rem;
    color: var(--text-2);
  }
  .spinner.small {
    width: 1.3rem;
    height: 1.3rem;
    border-width: 2px;
  }
  .err {
    color: var(--danger);
  }
  .hint {
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--text-3);
  }
</style>
