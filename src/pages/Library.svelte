<script lang="ts">
  import { jf, type Item } from '../lib/jellyfin';
  import { handle } from '../lib/errors';
  import Card from '../components/Card.svelte';

  let { kind }: { kind: 'Movie' | 'Series' | 'Favorites' } = $props();

  const TITLES = { Movie: 'Films', Series: 'Séries', Favorites: 'Ma liste' };
  const SORTS = [
    { id: 'recent', label: 'Ajouts récents', sortBy: 'DateCreated,SortName', order: 'Descending' },
    { id: 'title', label: 'Titre', sortBy: 'SortName', order: 'Ascending' },
    { id: 'year', label: 'Année', sortBy: 'ProductionYear,PremiereDate,SortName', order: 'Descending' },
    { id: 'rating', label: 'Note', sortBy: 'CommunityRating,SortName', order: 'Descending' },
    { id: 'random', label: 'Au hasard', sortBy: 'Random', order: 'Ascending' },
  ];
  const PAGE = 60;

  let sort = $state('recent');
  let genre = $state('');
  let unwatched = $state(false);
  let genres = $state<string[]>([]);
  let items = $state<Item[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let error = $state('');
  let sentinel: HTMLDivElement;
  let gen = 0;

  const types = $derived(kind === 'Favorites' ? 'Movie,Series' : kind);

  function query(start: number) {
    const s = SORTS.find((x) => x.id === sort)!;
    return {
      includeItemTypes: types,
      sortBy: s.sortBy,
      sortOrder: s.order,
      startIndex: start,
      limit: PAGE,
      genres: genre || undefined,
      isFavorite: kind === 'Favorites' ? true : undefined,
      isPlayed: unwatched ? false : undefined,
    };
  }

  async function reload() {
    const g = ++gen;
    loading = true;
    error = '';
    try {
      const r = await jf.items(query(0));
      if (g !== gen) return;
      items = r.Items;
      total = r.TotalRecordCount;
    } catch (err) {
      error = handle(err);
    } finally {
      if (g === gen) loading = false;
    }
  }

  async function more() {
    if (loading || items.length >= total) return;
    const g = gen;
    loading = true;
    try {
      const r = await jf.items(query(items.length));
      if (g === gen) items = [...items, ...r.Items.filter((i) => !items.some((x) => x.Id === i.Id))];
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void sort;
    void genre;
    void unwatched;
    reload();
  });

  $effect(() => {
    jf.get<{ Items: { Name: string }[] }>('/Genres', { userId: jf.userId, includeItemTypes: types, sortBy: 'SortName', isFavorite: kind === 'Favorites' ? true : undefined })
      .then((r) => (genres = r.Items.map((g) => g.Name)))
      .catch(() => {});
  });

  $effect(() => {
    const io = new IntersectionObserver((e) => e[0].isIntersecting && more(), { rootMargin: '800px' });
    io.observe(sentinel);
    return () => io.disconnect();
  });
</script>

<div class="library fade-in">
  <div class="top">
    <h1>{TITLES[kind]}</h1>
    {#if total}<span class="count">{total} titre{total > 1 ? 's' : ''}</span>{/if}
    <div class="spacer"></div>
    <div class="sorts">
      {#each SORTS as s (s.id)}
        <button class="pill" class:on={sort === s.id} onclick={() => (sort = s.id)}>{s.label}</button>
      {/each}
      <button class="pill" class:on={unwatched} onclick={() => (unwatched = !unwatched)}>Non vus</button>
    </div>
  </div>
  {#if genres.length > 1}
    <div class="genres" data-row>
      <button class="g" class:on={!genre} onclick={() => (genre = '')}>Tous</button>
      {#each genres as g (g)}
        <button class="g" class:on={genre === g} onclick={() => (genre = genre === g ? '' : g)}>{g}</button>
      {/each}
    </div>
  {/if}

  {#if error}
    <p class="error">{error}</p>
  {:else if !loading && !items.length}
    <p class="empty">{kind === 'Favorites' ? 'Votre liste est vide : ajoutez des titres avec le bouton +.' : 'Aucun titre.'}</p>
  {/if}
  <div class="grid">
    {#each items as it (it.Id)}
      <Card item={it} />
    {/each}
  </div>
  <div bind:this={sentinel} class="sentinel">{#if loading}<div class="spinner"></div>{/if}</div>
</div>

<style>
  .library {
    padding: 6.5rem var(--pad) 3rem;
    min-height: 100vh;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem 1.2rem;
    margin-bottom: 1.2rem;
  }
  h1 {
    font-size: 2.2rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .count {
    color: var(--text-3);
  }
  .spacer {
    flex: 1;
  }
  .sorts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .pill,
  .g {
    flex: none;
    padding: 0.45rem 0.95rem;
    border-radius: 2rem;
    font-size: 0.9rem;
    color: var(--text-2);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid transparent;
  }
  .pill.on {
    color: #1b1104;
    background: var(--gold-grad);
    font-weight: 600;
  }
  .genres {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 0.2rem 0 1.4rem;
  }
  .g.on {
    border-color: var(--gold);
    color: var(--gold);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--poster-w), 1fr));
    gap: 1.6rem 1rem;
    --poster-w: 10rem;
  }
  .grid :global(.card) {
    width: 100%;
  }
  .sentinel {
    display: grid;
    place-items: center;
    min-height: 4rem;
    margin-top: 1.5rem;
  }
  .empty,
  .error {
    padding: 2rem 0;
    color: var(--text-2);
  }
  .error {
    color: var(--danger);
  }
  @media (max-width: 700px) {
    .grid {
      --poster-w: 6.8rem;
      gap: 1rem 0.6rem;
    }
    h1 {
      font-size: 1.7rem;
    }
  }
</style>
