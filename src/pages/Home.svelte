<script lang="ts">
  import { jf, type Item } from '../lib/jellyfin';
  import { handle } from '../lib/errors';
  import { router } from '../lib/router.svelte';
  import Billboard from '../components/Billboard.svelte';
  import Row from '../components/Row.svelte';

  type RowData = { key: string; title: string; items: Item[]; variant?: 'poster' | 'landscape'; play?: boolean; ranked?: boolean; more?: string };

  let featured = $state<Item[]>([]);
  let rows = $state<RowData[]>([]);
  let error = $state('');
  let loading = $state(true);

  // « Reprendre » : retirer un titre (position remise à zéro dans Jellyfin).
  async function removeResume(it: Item) {
    rows = rows.map((r) => (r.key === 'continue' ? { ...r, items: r.items.filter((x) => x.Id !== it.Id) } : r));
    if (it.UserData?.PlaybackPositionTicks) await jf.clearResume(it.Id).catch(() => {});
  }

  const shuffle = <T,>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map(([, v]) => v);

  async function load() {
    try {
      const views = await jf.views();
      const movieViews = views.filter((v) => v.CollectionType === 'movies');
      const showViews = views.filter((v) => v.CollectionType === 'tvshows');

      const [feat, resume, nextUp, favorites, top, discover, genres, ...latest] = await Promise.all([
        jf.items({ includeItemTypes: 'Movie,Series', sortBy: 'Random', limit: 12, imageTypes: 'Backdrop', hasOverview: true, fields: 'Overview,Genres,ChildCount' }).then((r) => r.Items),
        jf.resume(20),
        jf.nextUp(20),
        jf.items({ isFavorite: true, includeItemTypes: 'Movie,Series', sortBy: 'DateCreated', sortOrder: 'Descending', limit: 30 }).then((r) => r.Items),
        jf.items({ includeItemTypes: 'Movie', sortBy: 'CommunityRating,SortName', sortOrder: 'Descending', limit: 10, minCommunityRating: 6 }).then((r) => r.Items),
        jf.items({ includeItemTypes: 'Movie', sortBy: 'Random', isPlayed: false, limit: 24 }).then((r) => r.Items),
        jf.genres().catch(() => []),
        ...[...movieViews, ...showViews].map((v) => jf.latest(v.Id, 24).then((items) => ({ v, items }))),
      ]);

      featured = feat.filter((i) => i.BackdropImageTags?.length).slice(0, 6);

      // « Reprendre » : en cours d'abord, puis les prochains épisodes des séries suivies.
      const seen = new Set(resume.map((i) => i.SeriesId ?? i.Id));
      const continueRow = [...resume, ...nextUp.filter((i) => !seen.has(i.SeriesId ?? i.Id))];

      const list: RowData[] = [];
      if (continueRow.length) list.push({ key: 'continue', title: 'Reprendre', items: continueRow, variant: 'landscape', play: true });
      for (const { v, items } of latest) {
        const label = v.CollectionType === 'movies' ? 'Films' : 'Séries';
        const many = latest.filter((l) => l.v.CollectionType === v.CollectionType).length > 1;
        list.push({
          key: `latest-${v.Id}`,
          title: `Nouveautés · ${many ? v.Name : label}`,
          items,
          more: v.CollectionType === 'movies' ? '/films' : '/series',
        });
      }
      if (favorites.length) list.push({ key: 'fav', title: 'Ma liste', items: favorites, more: '/ma-liste' });
      if (top.length >= 5) list.push({ key: 'top', title: 'Top 10 des films', items: top, ranked: true });
      if (discover.length) list.push({ key: 'discover', title: 'À découvrir', items: discover });

      rows = list;
      loading = false;

      // Quelques genres au hasard, chargés ensuite (l'accueil s'affiche sans les attendre).
      const picks = shuffle(genres).slice(0, 4);
      const extra = await Promise.all(
        picks.map((g) =>
          jf.items({ genres: g.Name, includeItemTypes: 'Movie,Series', sortBy: 'Random', limit: 20 }).then((r) => ({ key: `g-${g.Id}`, title: g.Name, items: r.Items })),
        ),
      );
      rows = [...rows, ...extra.filter((r) => r.items.length >= 4)];
    } catch (err) {
      error = handle(err);
      loading = false;
    }
  }

  $effect(() => {
    load();
  });
</script>

<div class="home">
  {#if loading}
    <div class="loading"><div class="spinner"></div></div>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <Billboard items={featured} />
    <div class="rows" class:nobill={!featured.length}>
      {#each rows as r (r.key)}
        <Row title={r.title} items={r.items} variant={r.variant} play={r.play} ranked={r.ranked} onmore={r.more ? () => router.go(r.more!) : undefined} onremove={r.key === 'continue' ? removeResume : undefined} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .home {
    min-height: 100vh;
    padding-bottom: 3rem;
  }
  .rows {
    position: relative;
    z-index: 2;
  }
  .rows.nobill {
    padding-top: 6rem;
  }
  .loading {
    height: 100vh;
    display: grid;
    place-items: center;
  }
  .error {
    padding: 8rem var(--pad);
    color: var(--danger);
  }
</style>
