<script lang="ts">
  import { mdiPlay, mdiInformationOutline } from '@mdi/js';
  import type { Item } from '../lib/jellyfin';
  import { backdropOf, logoOf } from '../lib/jellyfin';
  import { duration, years } from '../lib/format';
  import { router, links } from '../lib/router.svelte';
  import { play } from '../lib/play';
  import { TV } from '../lib/tv';
  import Icon from './Icon.svelte';

  // Grande affiche en tête de l'accueil : quelques titres qui défilent, comme Netflix.

  let { items }: { items: Item[] } = $props();
  let index = $state(0);
  let paused = $state(false);
  const it = $derived(items[index]);

  $effect(() => {
    if (items.length < 2 || paused) return;
    const t = setInterval(() => (index = (index + 1) % items.length), 11000);
    return () => clearInterval(t);
  });

  let logoFailed = $state<Record<string, boolean>>({});
</script>

{#if it}
  <section class="billboard" role="presentation" onfocusin={() => (paused = true)} onfocusout={() => (paused = false)} onmouseenter={() => (paused = true)} onmouseleave={() => (paused = false)}>
    {#each items as b, i (b.Id)}
      {@const src = backdropOf(b, 1920)}
      {#if src}<img class="bd" class:show={i === index} {src} alt="" fetchpriority={i === 0 ? 'high' : 'low'} />{/if}
    {/each}
    <div class="shade"></div>

    {#key it.Id}
      <div class="info fade-in">
        {#if logoOf(it) && !logoFailed[it.Id]}
          <img class="logo" src={logoOf(it)} alt={it.Name} onerror={() => (logoFailed[it.Id] = true)} />
        {:else}
          <h1>{it.Name}</h1>
        {/if}
        <p class="meta">
          {#if it.CommunityRating}<span class="score">★ {it.CommunityRating.toFixed(1)}</span>{/if}
          {#if years(it)}<span>{years(it)}</span>{/if}
          {#if it.OfficialRating}<span class="chip">{it.OfficialRating}</span>{/if}
          {#if it.Type === 'Movie' && it.RunTimeTicks}<span>{duration(it.RunTimeTicks)}</span>{/if}
          {#if it.Type === 'Series' && it.ChildCount}<span>{it.ChildCount} saison{it.ChildCount > 1 ? 's' : ''}</span>{/if}
          {#if it.Genres?.length}<span class="genres">{it.Genres.slice(0, 3).join(' · ')}</span>{/if}
        </p>
        {#if it.Overview}<p class="overview clamp-3">{it.Overview}</p>{/if}
        <div class="actions">
          <button class="btn gold" onclick={() => play(it)} data-autofocus={TV ? '' : undefined}><Icon path={mdiPlay} size={1.5} /> Lecture</button>
          <button class="btn glass" onclick={() => router.go(links.item(it.Id))}><Icon path={mdiInformationOutline} size={1.4} /> Plus d’infos</button>
        </div>
      </div>
    {/key}

    {#if items.length > 1}
      <div class="dots">
        {#each items as b, i (b.Id)}
          <button class:on={i === index} onclick={() => (index = i)} tabindex="-1" aria-label="Titre {i + 1}"></button>
        {/each}
      </div>
    {/if}
  </section>
{/if}

<style>
  .billboard {
    position: relative;
    height: min(86vh, 56vw);
    min-height: 30rem;
    overflow: hidden;
    margin-bottom: -6rem;
  }
  .bd {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 20%;
    opacity: 0;
    transform: scale(1.06);
    transition: opacity 1.2s ease, transform 12s linear;
  }
  .bd.show {
    opacity: 1;
    transform: scale(1);
  }
  .shade {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, rgba(11, 12, 15, 0.92) 0%, rgba(11, 12, 15, 0.55) 35%, rgba(11, 12, 15, 0) 65%),
      linear-gradient(0deg, var(--bg) 0%, rgba(11, 12, 15, 0.6) 18%, rgba(11, 12, 15, 0) 45%),
      linear-gradient(180deg, rgba(11, 12, 15, 0.55) 0%, rgba(11, 12, 15, 0) 18%);
  }
  .info {
    position: absolute;
    left: var(--pad);
    bottom: 9.5rem;
    width: min(38rem, 80vw);
    display: grid;
    gap: 1rem;
  }
  .logo {
    max-width: min(30rem, 70vw);
    max-height: 9rem;
    object-fit: contain;
    object-position: left bottom;
    filter: drop-shadow(0 0.3rem 1rem rgba(0, 0, 0, 0.6));
  }
  h1 {
    font-size: 3.4rem;
    font-size: clamp(2.2rem, 4.5vw, 4rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.05;
    text-shadow: 0 0.2rem 1.5rem rgba(0, 0, 0, 0.6);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.9rem;
    font-size: 1rem;
    color: var(--text-2);
  }
  .score {
    color: var(--gold);
    font-weight: 700;
  }
  .overview {
    font-size: 1.08rem;
    line-height: 1.5;
    color: rgba(240, 242, 246, 0.88);
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
  }
  .actions {
    display: flex;
    gap: 0.8rem;
    margin-top: 0.4rem;
  }
  .actions .btn {
    min-height: 3.1rem;
    padding: 0 1.8rem;
    font-size: 1.1rem;
  }
  .dots {
    position: absolute;
    right: var(--pad);
    bottom: 10rem;
    display: flex;
    gap: 0.45rem;
  }
  .dots button {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.35);
    transition: width 0.3s ease, background 0.3s ease;
  }
  .dots button.on {
    width: 1.6rem;
    background: var(--gold-grad);
  }
  @media (max-width: 700px) {
    .billboard {
      height: 78vh;
      min-height: 26rem;
      margin-bottom: -3rem;
    }
    .bd {
      object-position: 60% center;
    }
    .shade {
      background: linear-gradient(0deg, var(--bg) 5%, rgba(11, 12, 15, 0.7) 40%, rgba(11, 12, 15, 0.1) 75%), linear-gradient(180deg, rgba(11, 12, 15, 0.6), transparent 20%);
    }
    .info {
      left: 1rem;
      right: 1rem;
      width: auto;
      bottom: 4.5rem;
      justify-items: center;
      text-align: center;
    }
    .logo {
      object-position: center bottom;
      max-height: 6rem;
    }
    .meta {
      justify-content: center;
    }
    .overview {
      display: none;
    }
    .actions .btn {
      padding: 0 1.2rem;
    }
    .dots {
      left: 0;
      right: 0;
      justify-content: center;
      bottom: 2.4rem;
    }
  }
</style>
