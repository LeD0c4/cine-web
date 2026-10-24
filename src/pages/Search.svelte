<script lang="ts">
  import { mdiMagnify, mdiClose } from '@mdi/js';
  import { untrack } from 'svelte';
  import { jf, type Item } from '../lib/jellyfin';
  import { handle } from '../lib/errors';
  import { router } from '../lib/router.svelte';
  import { TV } from '../lib/tv';
  import Card from '../components/Card.svelte';
  import Row from '../components/Row.svelte';
  import Icon from '../components/Icon.svelte';

  let { q }: { q: string } = $props();
  let text = $state(untrack(() => q));
  let results = $state<Item[]>([]);
  let suggestions = $state<Item[]>([]);
  let loading = $state(false);
  let error = $state('');

  // Recherche au fil de la frappe ; l'adresse garde la requête (Retour la retrouve).
  $effect(() => {
    const term = text.trim();
    const t = setTimeout(async () => {
      router.go(`/recherche${term ? `?q=${encodeURIComponent(term)}` : ''}`, true);
      if (!term) {
        results = [];
        return;
      }
      loading = true;
      try {
        const r = await jf.items({ searchTerm: term, includeItemTypes: 'Movie,Series', limit: 60, sortBy: 'SortName' });
        if (term === text.trim()) results = r.Items;
        error = '';
      } catch (err) {
        error = handle(err);
      } finally {
        loading = false;
      }
    }, 280);
    return () => clearTimeout(t);
  });

  $effect(() => {
    jf.items({ includeItemTypes: 'Movie,Series', sortBy: 'Random', limit: 20 }).then((r) => (suggestions = r.Items)).catch(() => {});
  });
</script>

<div class="search fade-in">
  <label class="box">
    <Icon path={mdiMagnify} size={1.6} />
    <!-- svelte-ignore a11y_autofocus -->
    <input bind:value={text} placeholder="Titres, séries, films…" autofocus={!TV} data-autofocus enterkeyhint="search" />
    {#if text}<button onclick={() => (text = '')} aria-label="Effacer"><Icon path={mdiClose} size={1.4} /></button>{/if}
  </label>

  {#if error}
    <p class="msg err">{error}</p>
  {:else if text.trim() && !loading && !results.length}
    <p class="msg">Aucun résultat pour « {text.trim()} ».</p>
  {/if}

  {#if results.length}
    <div class="grid">
      {#each results as it (it.Id)}<Card item={it} />{/each}
    </div>
  {:else if !text.trim()}
    <div class="sugg"><Row title="Idées pour ce soir" items={suggestions} /></div>
  {/if}
</div>

<style>
  .search {
    padding: 6.5rem 0 3rem;
    min-height: 100vh;
  }
  .box {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    margin: 0 var(--pad) 2rem;
    padding: 0 1.2rem;
    min-height: 3.8rem;
    border-radius: 0.6rem;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--text-2);
  }
  .box:focus-within {
    border-color: var(--gold);
  }
  input {
    flex: 1;
    min-width: 0;
    background: none;
    border: 0;
    outline: none;
    font-size: 1.3rem;
    color: var(--text);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
    gap: 1.6rem 1rem;
    padding: 0 var(--pad);
  }
  .grid :global(.card) {
    width: 100%;
  }
  .msg {
    padding: 0 var(--pad) 1.5rem;
    color: var(--text-2);
  }
  .err {
    color: var(--danger);
  }
  .sugg {
    margin-top: 1rem;
  }
  @media (max-width: 700px) {
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(6.8rem, 1fr));
      gap: 1rem 0.6rem;
    }
  }
</style>
