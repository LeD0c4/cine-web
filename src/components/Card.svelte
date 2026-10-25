<script lang="ts">
  import { mdiPlay, mdiCheck, mdiClose } from '@mdi/js';
  import type { Item } from '../lib/jellyfin';
  import { posterOf, thumbOf } from '../lib/jellyfin';
  import { cardTitle, cardSubtitle, progress, remaining } from '../lib/format';
  import { router, links } from '../lib/router.svelte';
  import Icon from './Icon.svelte';

  let {
    item,
    variant = 'poster',
    play = false,
    rank,
    onremove,
  }: { item: Item; variant?: 'poster' | 'landscape'; play?: boolean; rank?: number; onremove?: () => void } = $props();

  const src = $derived(variant === 'poster' ? posterOf(item, 360) : thumbOf(item, 560));
  const pct = $derived(progress(item));
  const left = $derived(remaining(item));
  const played = $derived(item.UserData?.Played && item.Type !== 'Series');
  const unplayed = $derived(item.Type === 'Series' ? item.UserData?.UnplayedItemCount : 0);
  let failed = $state(false);

  function open() {
    router.go(play ? links.play(item.Id) : links.item(item.Type === 'Episode' && !play ? item.SeriesId ?? item.Id : item.Id));
  }
</script>

<div class="cw">
<button class="card {variant}" onclick={open} title={item.Name}>
  {#if rank}<span class="rank">{rank}</span>{/if}
  <span class="frame">
    {#if src && !failed}
      <img {src} alt="" loading="lazy" onerror={() => (failed = true)} />
    {:else}
      <span class="noimg"><span>{cardTitle(item)}</span></span>
    {/if}
    {#if played}<span class="badge done"><Icon path={mdiCheck} size={0.95} /></span>{/if}
    {#if unplayed}<span class="badge count">{unplayed}</span>{/if}
    {#if play}<span class="playicon"><Icon path={mdiPlay} size={2.2} /></span>{/if}
    {#if pct > 0 && pct < 100}<span class="bar"><span style:width="{pct}%"></span></span>{/if}
  </span>
  {#if variant === 'landscape'}
    <span class="meta">
      <span class="t ellipsis">{cardTitle(item)}</span>
      <!-- Épisode : saison, numéro et titre toujours visibles ; le temps restant vient en dessous. -->
      {#if item.Type === 'Episode' || !(play && left)}<span class="s ellipsis" class:ep={item.Type === 'Episode'}>{cardSubtitle(item)}</span>{/if}
      {#if play && left}<span class="s r">{left}</span>{/if}
    </span>
  {/if}
</button>
{#if onremove}
  <button class="rm" onclick={onremove} title="Retirer de « Reprendre »" aria-label="Retirer de Reprendre"><Icon path={mdiClose} size={1} /></button>
{/if}
</div>

<style>
  .cw {
    position: relative;
    flex: none;
  }
  .rm {
    position: absolute;
    top: 0.45rem;
    right: 0.45rem;
    z-index: 3;
    display: grid;
    place-items: center;
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 50%;
    color: #fff;
    background: rgba(10, 11, 14, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.25);
    opacity: 0;
    transition: opacity 0.2s ease, background 0.2s ease;
  }
  .cw:hover .rm,
  .rm:focus {
    opacity: 1;
  }
  .rm:hover,
  .rm:focus {
    background: var(--danger);
    border-color: transparent;
  }
  @media (hover: none) {
    .rm {
      opacity: 0.85;
    }
  }
  .card {
    position: relative;
    flex: none;
    display: grid;
    gap: 0.55rem;
    text-align: left;
    scroll-snap-align: start;
    transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .poster {
    width: var(--poster-w, 10.5rem);
  }
  .landscape {
    width: var(--land-w, 18rem);
  }
  .frame {
    position: relative;
    display: block;
    overflow: hidden;
    border-radius: var(--radius);
    background: linear-gradient(145deg, #23262d, #15171b);
    box-shadow: 0 0.4rem 1.2rem rgba(0, 0, 0, 0.35);
    transition: box-shadow 0.25s ease, outline-color 0.2s ease;
    outline: 3px solid transparent;
    outline-offset: 2px;
  }
  .poster .frame {
    aspect-ratio: 2 / 3;
  }
  .landscape .frame {
    aspect-ratio: 16 / 9;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.4s ease;
  }
  .noimg {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 1rem;
    text-align: center;
    font-weight: 700;
    color: var(--text-2);
    background: radial-gradient(circle at 30% 20%, rgba(253, 122, 16, 0.18), transparent 60%), linear-gradient(145deg, #262a32, #121418);
  }
  .card:hover,
  .card:focus-visible,
  :global(.tv) .card:focus {
    transform: scale(1.06);
    z-index: 2;
    outline: none;
  }
  .card:hover .frame {
    box-shadow: 0 1rem 2.2rem rgba(0, 0, 0, 0.6);
  }
  .card:focus-visible .frame,
  :global(.tv) .card:focus .frame {
    outline-color: var(--gold);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 1rem 2.5rem rgba(253, 122, 16, 0.25);
  }
  .card:hover img {
    transform: scale(1.04);
  }
  .bar {
    position: absolute;
    left: 0.6rem;
    right: 0.6rem;
    bottom: 0.55rem;
    height: 0.24rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.25);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--gold-grad);
  }
  .badge {
    position: absolute;
    top: 0.45rem;
    right: 0.45rem;
    display: grid;
    place-items: center;
    min-width: 1.6rem;
    height: 1.6rem;
    padding: 0 0.35rem;
    border-radius: 1rem;
    font-size: 0.8rem;
    font-weight: 700;
  }
  .done {
    background: rgba(10, 11, 14, 0.75);
    color: var(--gold);
  }
  .count {
    background: var(--gold-grad);
    color: #1b1104;
  }
  .playicon {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #fff;
    background: radial-gradient(circle, rgba(0, 0, 0, 0.35), transparent 55%);
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  .card:hover .playicon,
  .card:focus .playicon {
    opacity: 1;
  }
  .meta {
    display: grid;
    gap: 0.15rem;
    padding: 0 0.15rem;
  }
  .t {
    font-weight: 600;
    font-size: 0.95rem;
  }
  .s {
    font-size: 0.82rem;
    color: var(--text-3);
  }
  .s.ep {
    color: var(--text-2);
  }
  /* Moteurs web anciens (télés) : proportions des vignettes sans « aspect-ratio » */
  @supports not (aspect-ratio: 1 / 1) {
    .frame {
      height: 0;
    }
    .poster .frame {
      padding-top: 150%;
    }
    .landscape .frame {
      padding-top: 56.25%;
    }
    .frame img {
      position: absolute;
      top: 0;
      left: 0;
    }
  }
  .rank {
    position: absolute;
    left: -2.6rem;
    bottom: -0.6rem;
    font-size: 7rem;
    font-weight: 900;
    line-height: 1;
    color: var(--bg);
    -webkit-text-stroke: 3px rgba(200, 204, 212, 0.6);
    z-index: -1;
  }
</style>
