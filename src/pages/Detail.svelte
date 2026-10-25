<script lang="ts">
  import { mdiPlay, mdiPlus, mdiCheck, mdiEyeOutline, mdiEyeCheck, mdiRestart, mdiYoutube, mdiCast, mdiPencilOutline } from '@mdi/js';
  import CastPicker from '../components/CastPicker.svelte';
  import ItemAdmin from '../components/ItemAdmin.svelte';
  import { session } from '../lib/session.svelte';
  import { jf, backdropOf, logoOf, posterOf, thumbOf, personImage, type Item } from '../lib/jellyfin';
  import { duration, years, progress, quality, episodeCode, remaining } from '../lib/format';
  import { router, links } from '../lib/router.svelte';
  import { playTarget } from '../lib/play';
  import { handle } from '../lib/errors';
  import { TV } from '../lib/tv';
  import Icon from '../components/Icon.svelte';
  import Row from '../components/Row.svelte';

  let { id }: { id: string } = $props();

  let item = $state<Item | null>(null);
  let next = $state<Item | null>(null);
  let seasons = $state<Item[]>([]);
  let seasonId = $state('');
  let episodes = $state<Item[]>([]);
  let similar = $state<Item[]>([]);
  let error = $state('');
  let logoFailed = $state(false);
  let casting = $state(false);
  /** Gestion du titre (identifier, infos, images) : comptes administrateurs. */
  let managing = $state(false);

  async function load() {
    try {
      const it = await jf.item(id);
      // Un épisode ou une saison ouvre la fiche de la série, sur la bonne saison.
      if ((it.Type === 'Episode' || it.Type === 'Season') && it.SeriesId) {
        router.go(links.item(it.SeriesId), true);
        return;
      }
      item = it;
      const tasks: Promise<unknown>[] = [jf.similar(id, 16).then((s) => (similar = s)).catch(() => {})];
      if (it.Type === 'Series') {
        tasks.push(
          (async () => {
            const [ss, nx] = await Promise.all([jf.seasons(id), playTarget(it)]);
            seasons = ss;
            next = nx;
            seasonId = (nx?.SeasonId && ss.some((s) => s.Id === nx.SeasonId) ? nx.SeasonId : ss[0]?.Id) ?? '';
          })(),
        );
      } else {
        next = it;
      }
      await Promise.all(tasks);
    } catch (err) {
      error = handle(err);
    }
  }
  $effect(() => {
    load();
  });

  $effect(() => {
    if (!seasonId || !item) return;
    const sid = seasonId;
    jf.episodes(item.Id, sid).then((e) => {
      if (sid === seasonId) episodes = e;
    });
  });

  const resumeTicks = $derived(next?.UserData?.PlaybackPositionTicks ?? 0);
  const playLabel = $derived.by(() => {
    if (!item) return 'Lecture';
    const code = item.Type === 'Series' && next ? ` ${episodeCode(next)}` : '';
    return resumeTicks > 0 ? `Reprendre${code}` : item.Type === 'Series' && next && (next.IndexNumber !== 1 || next.ParentIndexNumber !== 1) ? `Lecture${code}` : 'Lecture';
  });

  const cast = $derived((item?.People ?? []).filter((p) => p.Type === 'Actor').slice(0, 20));
  const directors = $derived((item?.People ?? []).filter((p) => p.Type === 'Director').map((p) => p.Name));
  const writers = $derived((item?.People ?? []).filter((p) => p.Type === 'Writer').map((p) => p.Name).slice(0, 3));
  const tags = $derived(quality(item?.MediaStreams ?? item?.MediaSources?.[0]?.MediaStreams));
  const trailer = $derived(item?.RemoteTrailers?.find((t) => /youtu/.test(t.Url)));

  async function toggleFavorite() {
    if (!item) return;
    const on = !item.UserData?.IsFavorite;
    const ud = await jf.setFavorite(item.Id, on);
    item.UserData = { ...item.UserData, ...ud, IsFavorite: on };
  }
  async function togglePlayed() {
    if (!item) return;
    const on = !item.UserData?.Played;
    const ud = await jf.setPlayed(item.Id, on);
    item.UserData = { ...item.UserData, ...ud, Played: on };
    if (item.Type === 'Series') {
      next = await playTarget(item);
      if (seasonId) episodes = await jf.episodes(item.Id, seasonId);
    }
  }
  async function toggleEpisode(ep: Item, e: Event) {
    e.stopPropagation();
    const on = !ep.UserData?.Played;
    await jf.setPlayed(ep.Id, on);
    ep.UserData = { ...ep.UserData, Played: on, PlaybackPositionTicks: 0, PlayedPercentage: 0 };
    if (item) next = await playTarget(item);
  }
</script>

{#if error}
  <p class="error">{error}</p>
{:else if !item}
  <div class="loading"><div class="spinner"></div></div>
{:else}
  {@const bd = backdropOf(item, 1920)}
  {@const logo = logoOf(item)}
  <article class="detail fade-in">
    <header class="hero">
      {#if bd}<img class="bd" src={bd} alt="" />{:else if posterOf(item)}<img class="bd blur" src={posterOf(item, 600)} alt="" />{/if}
      <div class="shade"></div>
      <div class="head">
        {#if logo && !logoFailed}
          <img class="logo" src={logo} alt={item.Name} onerror={() => (logoFailed = true)} />
        {:else}
          <h1>{item.Name}</h1>
        {/if}
        <p class="meta">
          {#if item.CommunityRating}<span class="score">★ {item.CommunityRating.toFixed(1)}</span>{/if}
          {#if years(item)}<span>{years(item)}</span>{/if}
          {#if item.OfficialRating}<span class="chip">{item.OfficialRating}</span>{/if}
          {#if item.Type === 'Movie' && item.RunTimeTicks}<span>{duration(item.RunTimeTicks)}</span>{/if}
          {#if item.Type === 'Series' && seasons.length}<span>{seasons.length} saison{seasons.length > 1 ? 's' : ''}</span>{/if}
          {#each tags as t (t)}<span class="chip">{t}</span>{/each}
        </p>
        {#if item.Taglines?.[0]}<p class="tagline">« {item.Taglines[0]} »</p>{/if}

        <div class="actions">
          <button class="btn gold play" disabled={!next} onclick={() => next && router.go(links.play(next.Id))} data-autofocus>
            <Icon path={mdiPlay} size={1.6} /> {playLabel}
          </button>
          {#if resumeTicks > 0 && next}
            <button class="btn glass" onclick={() => next && router.go(links.play(next.Id, true))}><Icon path={mdiRestart} size={1.3} /> Depuis le début</button>
          {/if}
          <button class="round" class:on={item.UserData?.IsFavorite} onclick={toggleFavorite} title={item.UserData?.IsFavorite ? 'Retirer de ma liste' : 'Ajouter à ma liste'}>
            <Icon path={item.UserData?.IsFavorite ? mdiCheck : mdiPlus} size={1.5} />
          </button>
          <button class="round" class:on={item.UserData?.Played} onclick={togglePlayed} title={item.UserData?.Played ? 'Marquer comme non vu' : 'Marquer comme vu'}>
            <Icon path={item.UserData?.Played ? mdiEyeCheck : mdiEyeOutline} size={1.4} />
          </button>
          {#if next}
            <button class="round" onclick={() => (casting = true)} title="Lire sur un autre appareil (Chromecast, Xbox…)"><Icon path={mdiCast} size={1.3} /></button>
          {/if}
          {#if trailer && !TV}
            <a class="round" href={trailer.Url} target="_blank" rel="noreferrer" title="Bande-annonce"><Icon path={mdiYoutube} size={1.4} /></a>
          {/if}
          {#if session.isAdmin}
            <button class="round" onclick={() => (managing = true)} title="Gérer ce titre (identifier, infos, images)"><Icon path={mdiPencilOutline} size={1.3} /></button>
          {/if}
        </div>
        {#if resumeTicks > 0 && next?.RunTimeTicks}
          <div class="resume">
            <span class="bar"><span style:width="{progress(next)}%"></span></span>
            <span>{remaining(next)}</span>
          </div>
        {/if}
      </div>
    </header>

    <section class="about">
      <div class="left">
        {#if item.Type === 'Series' && next && next.Overview}
          <h3 class="ep-title"><span>À suivre</span> {episodeCode(next)} — {next.Name}</h3>
        {/if}
        <p class="overview">{item.Overview ?? ''}</p>
      </div>
      <dl class="right">
        {#if cast.length}<div><dt>Distribution</dt><dd>{cast.slice(0, 4).map((p) => p.Name).join(', ')}</dd></div>{/if}
        {#if item.Genres?.length}<div><dt>Genres</dt><dd>{item.Genres.join(', ')}</dd></div>{/if}
        {#if directors.length}<div><dt>Réalisation</dt><dd>{directors.join(', ')}</dd></div>{/if}
        {#if writers.length}<div><dt>Scénario</dt><dd>{writers.join(', ')}</dd></div>{/if}
        {#if item.Studios?.length}<div><dt>Studio</dt><dd>{item.Studios.slice(0, 2).map((s) => s.Name).join(', ')}</dd></div>{/if}
      </dl>
    </section>

    {#if item.Type === 'Series' && seasons.length}
      <section class="episodes">
        <div class="seasons" data-row>
          {#each seasons as s (s.Id)}
            <button class="season" class:on={s.Id === seasonId} onclick={() => (seasonId = s.Id)}>{s.Name}</button>
          {/each}
        </div>
        <ol>
          {#each episodes as ep (ep.Id)}
            {@const th = thumbOf(ep, 480)}
            {@const pct = progress(ep)}
            <li>
              <button class="ep" class:current={ep.Id === next?.Id} onclick={() => router.go(links.play(ep.Id))}>
                <span class="num">{ep.IndexNumber ?? ''}</span>
                <span class="thumb">
                  {#if th}<img src={th} alt="" loading="lazy" />{/if}
                  <span class="pi"><Icon path={mdiPlay} size={2} /></span>
                  {#if pct > 0 && pct < 100}<span class="bar"><span style:width="{pct}%"></span></span>{/if}
                </span>
                <span class="txt">
                  <span class="row1"><b class="ellipsis">{ep.Name}</b><span class="dur">{duration(ep.RunTimeTicks)}</span></span>
                  {#if ep.Overview}<span class="ov">{ep.Overview}</span>{/if}
                </span>
              </button>
              <button class="seen" class:on={ep.UserData?.Played} onclick={(e) => toggleEpisode(ep, e)} title={ep.UserData?.Played ? 'Vu' : 'Marquer comme vu'}>
                <Icon path={ep.UserData?.Played ? mdiCheck : mdiEyeOutline} size={1.2} />
              </button>
            </li>
          {:else}
            <li class="empty">Chargement des épisodes…</li>
          {/each}
        </ol>
      </section>
    {/if}

    {#if cast.length}
      <section class="cast-sec">
        <h2>Distribution</h2>
        <div class="cast" data-row>
          {#each cast as p (p.Id + (p.Role ?? ''))}
            {@const img = personImage(p)}
            <div class="person" data-focus tabindex="-1">
              <span class="ph">{#if img}<img src={img} alt="" loading="lazy" />{:else}{p.Name.charAt(0)}{/if}</span>
              <b class="ellipsis">{p.Name}</b>
              {#if p.Role}<span class="ellipsis">{p.Role}</span>{/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if similar.length}
      <div class="similar"><Row title="Titres similaires" items={similar} /></div>
    {/if}
  </article>
  {#if casting && next}<CastPicker item={next} onclose={() => (casting = false)} />{/if}
  {#if managing && item}<ItemAdmin {item} onclose={() => (managing = false)} onchanged={load} />{/if}
{/if}

<style>
  .loading {
    height: 100vh;
    display: grid;
    place-items: center;
  }
  .error {
    padding: 8rem var(--pad);
    color: var(--danger);
  }
  .detail {
    padding-bottom: 4rem;
  }
  .hero {
    position: relative;
    min-height: min(82vh, 52vw);
    display: flex;
    align-items: flex-end;
  }
  .bd {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 20%;
  }
  .bd.blur {
    filter: blur(30px) brightness(0.6);
    transform: scale(1.2);
  }
  .shade {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, rgba(11, 12, 15, 0.95) 0%, rgba(11, 12, 15, 0.6) 38%, rgba(11, 12, 15, 0) 70%),
      linear-gradient(0deg, var(--bg) 0%, rgba(11, 12, 15, 0) 40%),
      linear-gradient(180deg, rgba(11, 12, 15, 0.6) 0%, rgba(11, 12, 15, 0) 20%);
  }
  .head {
    position: relative;
    width: min(44rem, 92vw);
    display: grid;
    gap: 1rem;
    padding: 7rem var(--pad) 2rem;
  }
  .logo {
    max-width: min(30rem, 80vw);
    max-height: 9.5rem;
    object-fit: contain;
    object-position: left bottom;
    filter: drop-shadow(0 0.3rem 1rem rgba(0, 0, 0, 0.6));
  }
  h1 {
    font-size: 3.2rem;
    font-size: clamp(2.2rem, 4.5vw, 3.8rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.05;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.9rem;
    color: var(--text-2);
  }
  .score {
    color: var(--gold);
    font-weight: 700;
  }
  .tagline {
    font-style: italic;
    color: var(--text-2);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.8rem;
    margin-top: 0.3rem;
  }
  .play {
    min-height: 3.2rem;
    padding: 0 2rem;
    font-size: 1.15rem;
  }
  .btn:disabled {
    opacity: 0.5;
  }
  .resume {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    font-size: 0.9rem;
    color: var(--text-2);
  }
  .resume .bar {
    width: 12rem;
  }
  .bar {
    display: block;
    height: 0.25rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.22);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--gold-grad);
  }

  .about {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    gap: 2.5rem;
    padding: 1rem var(--pad) 2rem;
  }
  .overview {
    font-size: 1.1rem;
    line-height: 1.65;
    color: rgba(240, 242, 246, 0.9);
    max-width: 48rem;
  }
  .ep-title {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.6rem;
    color: var(--text);
  }
  .ep-title span {
    margin-right: 0.4rem;
    color: var(--gold);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.8rem;
  }
  dl {
    margin: 0;
    display: grid;
    gap: 0.8rem;
    align-content: start;
    font-size: 0.95rem;
  }
  dt {
    display: inline;
    color: var(--text-3);
  }
  dt::after {
    content: ' : ';
  }
  dd {
    display: inline;
    margin: 0;
    color: var(--text-2);
  }

  .episodes {
    padding: 0 var(--pad) 2rem;
  }
  .seasons {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 0.3rem 0.2rem 1rem;
    margin-bottom: 0.4rem;
    border-bottom: 1px solid var(--line);
  }
  .season {
    flex: none;
    padding: 0.55rem 1.1rem;
    border-radius: 2rem;
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-2);
    font-weight: 600;
  }
  .season.on {
    background: var(--gold-grad);
    color: #1b1104;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    position: relative;
    border-bottom: 1px solid var(--line);
  }
  .ep {
    width: 100%;
    display: grid;
    grid-template-columns: 2.4rem 14rem minmax(0, 1fr);
    align-items: center;
    gap: 1.2rem;
    padding: 1.1rem 3.5rem 1.1rem 0.6rem;
    text-align: left;
    border-radius: 0.5rem;
    transition: background 0.2s ease;
  }
  .ep:hover,
  .ep:focus {
    background: rgba(255, 255, 255, 0.04);
  }
  .ep.current {
    background: linear-gradient(90deg, var(--gold-soft), transparent 70%);
  }
  .num {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-3);
    text-align: center;
  }
  .thumb {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: 0.45rem;
    overflow: hidden;
    background: #1c1f25;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  @supports not (aspect-ratio: 1 / 1) {
    .thumb {
      height: 0;
      padding-top: 56.25%;
    }
    .thumb img {
      position: absolute;
      top: 0;
      left: 0;
    }
  }
  .thumb .bar {
    position: absolute;
    left: 0.5rem;
    right: 0.5rem;
    bottom: 0.45rem;
  }
  .pi {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    opacity: 0;
    background: rgba(0, 0, 0, 0.35);
    transition: opacity 0.2s ease;
  }
  .ep:hover .pi,
  .ep:focus .pi {
    opacity: 1;
  }
  .txt {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }
  .row1 {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }
  .dur {
    flex: none;
    color: var(--text-3);
  }
  .ov {
    font-size: 0.92rem;
    line-height: 1.5;
    color: var(--text-2);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .seen {
    position: absolute;
    right: 0.6rem;
    top: 50%;
    transform: translateY(-50%);
    display: grid;
    place-items: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: var(--text-3);
  }
  .seen.on {
    color: var(--gold);
    border-color: var(--gold);
  }
  .empty {
    padding: 1.5rem 0.6rem;
    color: var(--text-3);
  }

  .cast-sec h2 {
    padding: 0 var(--pad);
    font-size: 1.3rem;
    margin-bottom: 0.8rem;
  }
  .cast {
    display: flex;
    gap: 1.2rem;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 0.3rem var(--pad) 2rem;
  }
  .person {
    flex: none;
    width: 7.5rem;
    display: grid;
    justify-items: center;
    gap: 0.3rem;
    text-align: center;
    font-size: 0.85rem;
    color: var(--text-3);
    border-radius: 0.5rem;
  }
  .person b {
    max-width: 100%;
    color: var(--text);
    font-weight: 600;
  }
  .person span.ellipsis {
    max-width: 100%;
  }
  .ph {
    display: grid;
    place-items: center;
    width: 6rem;
    height: 6rem;
    border-radius: 50%;
    overflow: hidden;
    background: linear-gradient(145deg, #2a2e36, #16181d);
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-3);
    margin-bottom: 0.3rem;
  }
  .ph img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  @media (max-width: 760px) {
    .hero {
      min-height: 70vh;
    }
    .head {
      padding-top: 5rem;
    }
    .about {
      grid-template-columns: 1fr;
      gap: 1.2rem;
    }
    .ep {
      grid-template-columns: 9rem minmax(0, 1fr);
      gap: 0.9rem;
      padding-right: 3rem;
    }
    .num {
      display: none;
    }
  }
</style>
