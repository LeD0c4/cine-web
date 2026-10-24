<script lang="ts">
  import { mdiChevronLeft, mdiChevronRight } from '@mdi/js';
  import type { Item } from '../lib/jellyfin';
  import Card from './Card.svelte';
  import Icon from './Icon.svelte';

  let {
    title,
    items,
    variant = 'poster',
    play = false,
    ranked = false,
    onmore,
    onremove,
  }: {
    title: string; items: Item[]; variant?: 'poster' | 'landscape'; play?: boolean; ranked?: boolean;
    onmore?: () => void; onremove?: (item: Item) => void;
  } = $props();

  let track = $state<HTMLDivElement>();
  let atStart = $state(true);
  let atEnd = $state(false);

  function update() {
    if (!track) return;
    atStart = track.scrollLeft < 8;
    atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8;
  }
  $effect(() => {
    void items.length;
    queueMicrotask(update);
  });
  const page = (dir: number) => track?.scrollBy({ left: dir * track.clientWidth * 0.85, behavior: 'smooth' });
</script>

{#if items.length}
  <section class="row" class:ranked>
    <h2>
      {#if onmore}<button class="more" onclick={onmore}>{title} <span>Tout voir <Icon path={mdiChevronRight} size={1.1} /></span></button>
      {:else}{title}{/if}
    </h2>
    <div class="wrap">
      {#if !atStart}<button class="arrow left" tabindex="-1" onclick={() => page(-1)} aria-label="Précédents"><Icon path={mdiChevronLeft} size={2.4} /></button>{/if}
      <div class="track" bind:this={track} onscroll={update} data-row>
        {#each items as it, i (it.Id)}
          <Card item={it} {variant} {play} rank={ranked ? i + 1 : undefined} onremove={onremove ? () => onremove(it) : undefined} />
        {/each}
      </div>
      {#if !atEnd}<button class="arrow right" tabindex="-1" onclick={() => page(1)} aria-label="Suivants"><Icon path={mdiChevronRight} size={2.4} /></button>{/if}
    </div>
  </section>
{/if}

<style>
  .row {
    position: relative;
    margin-bottom: 2.2rem;
  }
  h2 {
    padding: 0 var(--pad);
    margin-bottom: 0.7rem;
    font-size: 1.3rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .more {
    display: inline-flex;
    align-items: baseline;
    gap: 0.8rem;
    font-weight: inherit;
  }
  .more span {
    display: inline-flex;
    align-items: center;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--gold);
    opacity: 0;
    transform: translateX(-0.5rem);
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  .more:hover span,
  .more:focus span {
    opacity: 1;
    transform: none;
  }
  .wrap {
    position: relative;
  }
  .track {
    display: flex;
    gap: 0.7rem;
    overflow-x: auto;
    overflow-y: visible;
    scroll-snap-type: x proximity;
    scroll-padding: 0 var(--pad);
    padding: 0.6rem var(--pad) 1rem;
    scrollbar-width: none;
  }
  .track::-webkit-scrollbar {
    display: none;
  }
  .ranked .track {
    gap: 3.4rem;
    padding-left: calc(var(--pad) + 2.8rem);
  }
  .arrow {
    position: absolute;
    top: 0.6rem;
    bottom: 1rem;
    z-index: 5;
    width: var(--pad);
    min-width: 2.6rem;
    display: grid;
    place-items: center;
    color: #fff;
    background: rgba(8, 9, 12, 0.55);
    opacity: 0;
    transition: opacity 0.2s ease, background 0.2s ease;
  }
  .wrap:hover .arrow {
    opacity: 1;
  }
  .arrow:hover {
    background: rgba(8, 9, 12, 0.8);
    color: var(--gold);
  }
  .left {
    left: 0;
  }
  .right {
    right: 0;
  }
  @media (hover: none) {
    .arrow {
      display: none;
    }
  }
  :global(.tv) .arrow {
    display: none;
  }
</style>
