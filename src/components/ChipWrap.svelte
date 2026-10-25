<script lang="ts">
  import { mdiDotsHorizontal, mdiChevronUp } from '@mdi/js';
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  // Boutons qui passent à la ligne. Replié : seule la première ligne est visible, avec « ⋯ » au bout
  // pour tout afficher. Les boutons cachés sortent de la navigation (clavier, télécommande).

  let { children, selected = '' }: { children: Snippet; selected?: string } = $props();

  let box: HTMLDivElement;
  let open = $state(false);
  let hiddenCount = $state(0);

  /** Repère les boutons hors de la première ligne (la mise en page est la même, repliée ou non). */
  function measure() {
    if (!box) return;
    const items = [...box.children] as HTMLElement[];
    const top = items[0]?.offsetTop ?? 0;
    let hidden = 0;
    for (const el of items) {
      const out = el.offsetTop > top + 4;
      if (out) hidden++;
      const masked = out && !open;
      el.toggleAttribute('inert', masked);
      if (masked) el.setAttribute('aria-hidden', 'true');
      else el.removeAttribute('aria-hidden');
    }
    hiddenCount = hidden;
    // Le choix en cours ne doit jamais être caché.
    if (!open && selected && items.some((el) => el.textContent?.trim() === selected && el.offsetTop > top + 4)) open = true;
  }

  $effect(() => {
    void open;
    void selected;
    measure();
  });
  $effect(() => {
    // Mesure après la mise en page (et après le chargement de la police, qui change la largeur des boutons).
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(later);
    resize.observe(box);
    for (const el of box.children) resize.observe(el);
    const content = new MutationObserver(() => {
      for (const el of box.children) resize.observe(el);
      later();
    });
    content.observe(box, { childList: true });
    document.fonts?.ready.then(later);
    later();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      content.disconnect();
    };
  });
</script>

<div class="cw" class:open>
  <div class="box" bind:this={box}>
    {@render children()}
  </div>
  <!-- Toujours présent (invisible s'il ne sert pas) : son apparition ne doit pas déplacer les boutons. -->
  <button
    class="more"
    class:idle={hiddenCount === 0}
    tabindex={hiddenCount === 0 ? -1 : undefined}
    aria-hidden={hiddenCount === 0 ? 'true' : undefined}
    onclick={() => (open = !open)}
    aria-expanded={open}
    title={open ? 'Moins de catégories' : `${hiddenCount} autres catégories`}
  >
    <Icon path={open ? mdiChevronUp : mdiDotsHorizontal} size={1.2} />
    {#if open}Moins{/if}
  </button>
</div>

<style>
  .cw {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
  }
  /* Marge intérieure : le liseré de focus (3 px + 3 px d'écart) n'est jamais rogné. */
  .box {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    padding: 6px;
    margin: -6px;
    /* Replié : une ligne (hauteur d'un bouton + marges) */
    max-height: calc(2.4rem + 12px);
    overflow: hidden;
  }
  .open .box {
    max-height: none;
  }
  .more {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    height: 2.3rem;
    min-width: 2.6rem;
    justify-content: center;
    padding: 0 0.7rem;
    border-radius: 2rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text);
    background: rgba(255, 255, 255, 0.1);
  }
  .more:hover {
    color: var(--gold);
  }
  .more.idle {
    visibility: hidden;
  }
</style>
