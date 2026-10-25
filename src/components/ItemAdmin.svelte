<script lang="ts">
  import { mdiClose, mdiMagnify, mdiCheck, mdiRefresh, mdiImageOutline, mdiPencilOutline, mdiDownload } from '@mdi/js';
  import { untrack } from 'svelte';
  import { jf, type Item } from '../lib/jellyfin';
  import { admin, type RemoteResult, type RemoteImage, type ImageKind } from '../lib/admin';
  import { handle } from '../lib/errors';
  import { trap } from '../lib/tv';
  import Icon from './Icon.svelte';

  // Gestion d'un titre (comptes administrateurs) : l'identifier quand Jellyfin ne l'a pas reconnu,
  // corriger ses infos, choisir ses images, relire ses métadonnées.

  let { item, onclose, onchanged }: { item: Item; onclose: () => void; onchanged: () => void } = $props();

  type Tab = 'identify' | 'info' | 'images' | 'refresh';
  let tab = $state<Tab>('identify');
  let busy = $state('');
  let error = $state('');
  let notice = $state('');

  async function run(key: string, fn: () => Promise<unknown>, done?: string) {
    busy = key;
    error = '';
    try {
      await fn();
      if (done) notice = done;
    } catch (err) {
      error = handle(err);
    } finally {
      busy = '';
    }
  }

  /** Le serveur termine la mise à jour en arrière-plan : la fiche est relue plusieurs fois. */
  function refreshSoon() {
    for (const ms of [1500, 5000, 12000]) setTimeout(onchanged, ms);
  }

  // ---------- Identifier ----------
  // Champs de recherche pré-remplis depuis la fiche à l'ouverture du panneau.
  // Nom de fichier → titre lisible : « A.Breed.Appart.2025.1080p » → « A Breed Appart » + 2025.
  const start = untrack(() => item);
  const raw = start.Name ?? '';
  const yearInName = raw.match(/\b(19|20)\d{2}\b/)?.[0];
  let query = $state(raw.replace(/[._]+/g, ' ').replace(/\s*[([]?\b(19|20)\d{2}\b.*$/, '').trim() || raw);
  let year = $state(String(start.ProductionYear ?? yearInName ?? ''));
  let imdb = $state(start.ProviderIds?.Imdb ?? '');
  let tmdb = $state(start.ProviderIds?.Tmdb ?? '');
  let results = $state<RemoteResult[] | null>(null);

  async function search() {
    await run('search', async () => {
      const ids: Record<string, string> = {};
      if (imdb.trim()) ids.Imdb = imdb.trim();
      if (tmdb.trim()) ids.Tmdb = tmdb.trim();
      results = await admin.identify(item.Id, item.Type, query.trim(), Number(year) || undefined, ids);
    });
  }
  async function apply(r: RemoteResult) {
    await run(`apply:${r.Name}`, async () => {
      await admin.applyIdentity(item.Id, r);
      refreshSoon();
    }, `« ${r.Name} » appliqué : la fiche se met à jour (quelques secondes).`);
  }

  // ---------- Infos ----------
  let dto = $state<Record<string, any> | null>(null);
  async function loadInfo() {
    if (dto) return;
    await run('info', async () => {
      dto = (await jf.item(item.Id)) as unknown as Record<string, any>;
    });
  }
  async function saveInfo() {
    const d = dto;
    if (!d) return;
    await run('save', async () => {
      await admin.updateItem(item.Id, { ...$state.snapshot(d), ProductionYear: Number(d.ProductionYear) || null });
      onchanged();
    }, 'Informations enregistrées.');
  }

  // ---------- Images ----------
  const KINDS: { id: ImageKind; label: string }[] = [
    { id: 'Primary', label: 'Affiche' },
    { id: 'Backdrop', label: 'Fond' },
    { id: 'Logo', label: 'Logo' },
    { id: 'Thumb', label: 'Vignette' },
  ];
  let kind = $state<ImageKind>('Primary');
  let images = $state<RemoteImage[] | null>(null);
  async function loadImages(k: ImageKind) {
    kind = k;
    images = null;
    await run('images', async () => {
      images = await admin.remoteImages(item.Id, k);
    });
  }
  async function pick(img: RemoteImage) {
    await run(`img:${img.Url}`, async () => {
      await admin.downloadImage(item.Id, kind, img.Url);
      onchanged();
    }, 'Image enregistrée.');
  }

  $effect(() => {
    if (tab === 'info') loadInfo();
    if (tab === 'images' && images === null && !busy) loadImages(kind);
  });

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'identify', label: 'Identifier', icon: mdiMagnify },
    { id: 'info', label: 'Infos', icon: mdiPencilOutline },
    { id: 'images', label: 'Images', icon: mdiImageOutline },
    { id: 'refresh', label: 'Actualiser', icon: mdiRefresh },
  ];
  const wide = (k: ImageKind) => k === 'Backdrop' || k === 'Thumb' || k === 'Logo';
</script>

<div class="backdrop" role="presentation" onclick={onclose}></div>
<div class="panel" use:trap={onclose} role="dialog" aria-label="Gérer ce titre">
  <header>
    <h2 class="ellipsis">Gérer « {item.Name} »</h2>
    <button class="ib" onclick={onclose} aria-label="Fermer"><Icon path={mdiClose} size={1.3} /></button>
  </header>

  <nav class="tabs">
    {#each TABS as t, i (t.id)}
      <button class="tab" class:on={tab === t.id} onclick={() => { tab = t.id; error = ''; notice = ''; }} data-autofocus={i === 0 ? '' : undefined}>
        <Icon path={t.icon} size={1.1} /> {t.label}
      </button>
    {/each}
  </nav>

  {#if error}<p class="msg err">{error}</p>{/if}
  {#if notice}<p class="msg ok">{notice}</p>{/if}

  <div class="body">
    {#if tab === 'identify'}
      <p class="hint">Jellyfin n’a pas reconnu ce titre, ou s’est trompé ? Cherchez-le, puis choisissez le bon résultat : titre, résumé, distribution et images seront remplacés.</p>
      <form class="search" onsubmit={(e) => { e.preventDefault(); search(); }}>
        <input class="input" bind:value={query} placeholder="Titre" />
        <input class="input year" bind:value={year} placeholder="Année" inputmode="numeric" />
        <button class="btn gold" disabled={!query.trim() || busy === 'search'}><Icon path={mdiMagnify} size={1.2} /> Chercher</button>
      </form>
      <details class="ids">
        <summary>Par identifiant (IMDb, TMDb)</summary>
        <div class="two">
          <input class="input" bind:value={imdb} placeholder="IMDb (tt1234567)" />
          <input class="input" bind:value={tmdb} placeholder="TMDb (12345)" />
        </div>
      </details>
      {#if busy === 'search'}<div class="spinner small"></div>{/if}
      {#if results}
        <div class="results">
          {#each results as r, i (i)}
            <button class="result" disabled={!!busy} onclick={() => apply(r)}>
              {#if r.ImageUrl}<img src={r.ImageUrl} alt="" loading="lazy" />{:else}<span class="noimg"></span>{/if}
              <span class="rt">
                <b>{r.Name}{r.ProductionYear ? ` (${r.ProductionYear})` : ''}</b>
                {#if r.Overview}<span class="hint clamp3">{r.Overview}</span>{/if}
                <span class="hint small">{r.SearchProviderName ?? ''}</span>
              </span>
              <span class="pickme"><Icon path={mdiCheck} size={1.2} /></span>
            </button>
          {:else}
            <p class="hint">Aucun résultat : essayez un autre titre, sans l’année, ou l’identifiant IMDb.</p>
          {/each}
        </div>
      {/if}
    {:else if tab === 'info'}
      {#if dto}
        <label class="field"><span>Titre</span><input class="input" bind:value={dto.Name} /></label>
        <div class="two">
          <label class="field"><span>Titre original</span><input class="input" bind:value={dto.OriginalTitle} /></label>
          <label class="field"><span>Année</span><input class="input" bind:value={dto.ProductionYear} inputmode="numeric" /></label>
        </div>
        <label class="field"><span>Résumé</span><textarea class="input area" bind:value={dto.Overview} rows="6"></textarea></label>
        <button class="toggle" role="switch" aria-checked={!!dto.LockData} onclick={() => (dto!.LockData = !dto!.LockData)}>
          <span class="tl"><b>Verrouiller</b><span class="hint">Les actualisations automatiques ne remplaceront plus ces informations.</span></span>
          <span class="sw" class:on={dto.LockData}><i></i></span>
        </button>
        <button class="btn gold" disabled={busy === 'save'} onclick={saveInfo}><Icon path={mdiCheck} size={1.2} /> Enregistrer</button>
      {:else}
        <div class="spinner small"></div>
      {/if}
    {:else if tab === 'images'}
      <div class="chips">
        {#each KINDS as k (k.id)}
          <button class="opt" class:on={kind === k.id} onclick={() => loadImages(k.id)}>{k.label}</button>
        {/each}
      </div>
      {#if images === null}
        <div class="spinner small"></div>
      {:else if images.length}
        <div class="grid" class:wide={wide(kind)}>
          {#each images as img (img.Url)}
            <button class="img" disabled={!!busy} onclick={() => pick(img)} title={[img.ProviderName, img.Language, img.Width && `${img.Width}×${img.Height}`].filter(Boolean).join(' · ')}>
              <img src={img.ThumbnailUrl || img.Url} alt="" loading="lazy" />
              <span class="cap">{img.ProviderName ?? ''}{img.Language ? ` · ${img.Language}` : ''}</span>
              {#if busy === `img:${img.Url}`}<span class="spin"><span class="spinner small"></span></span>{/if}
            </button>
          {/each}
        </div>
      {:else}
        <p class="hint">Aucune image trouvée. Identifiez d’abord le titre, ou actualisez ses métadonnées.</p>
      {/if}
    {:else}
      <p class="hint">Relit les informations et les images chez les fournisseurs (TMDb, IMDb…). Utile après avoir renommé un fichier ou quand des images manquent.</p>
      <div class="actions">
        <button class="btn glass" disabled={!!busy} onclick={() => run('refresh', async () => { await admin.refresh(item.Id, false); refreshSoon(); }, 'Recherche des informations manquantes lancée.')}>
          <Icon path={mdiRefresh} size={1.2} /> Compléter ce qui manque
        </button>
        <button class="btn gold" disabled={!!busy} onclick={() => run('refresh', async () => { await admin.refresh(item.Id, true); refreshSoon(); }, 'Remplacement de toutes les informations lancé.')}>
          <Icon path={mdiDownload} size={1.2} /> Tout remplacer
        </button>
      </div>
      <p class="hint small">« Tout remplacer » écrase aussi les informations modifiées à la main (sauf si la fiche est verrouillée).</p>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
    background: rgba(0, 0, 0, 0.6);
    animation: fade-in 0.15s ease;
  }
  .panel {
    position: fixed;
    z-index: 151;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(48rem, calc(100vw - 1.5rem));
    max-height: calc(100vh - 1.5rem);
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding: 1.2rem 1.3rem;
    border-radius: 0.9rem;
    background: rgba(18, 20, 25, 0.98);
    border: 1px solid var(--line);
    box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.7);
    animation: fade-in 0.15s ease;
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }
  h2 {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 1.25rem;
  }
  .ib {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    color: var(--text-2);
  }
  .tabs,
  .chips,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .tab,
  .opt {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    height: 2.4rem;
    padding: 0 0.95rem;
    border-radius: 2rem;
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--text-2);
    background: rgba(255, 255, 255, 0.06);
  }
  .tab.on,
  .opt.on {
    color: #1b1104;
    background: var(--gold-grad);
  }
  .body {
    display: grid;
    gap: 0.8rem;
    overflow-y: auto;
    padding-right: 0.2rem;
  }
  .hint {
    margin: 0;
    color: var(--text-2);
    font-size: 0.92rem;
    line-height: 1.4;
  }
  .small {
    font-size: 0.82rem;
    color: var(--text-3);
  }
  .msg {
    margin: 0;
    padding: 0.6rem 0.9rem;
    border-radius: 0.5rem;
  }
  .msg.err {
    background: rgba(255, 95, 95, 0.12);
    color: var(--danger);
  }
  .msg.ok {
    background: var(--gold-soft);
    color: var(--gold);
  }
  .search {
    display: grid;
    grid-template-columns: 1fr 6.5rem auto;
    gap: 0.5rem;
  }
  .ids summary {
    cursor: pointer;
    color: var(--text-2);
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .results {
    display: grid;
    gap: 0.4rem;
  }
  .result {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.5rem;
    border-radius: 0.6rem;
    text-align: left;
    background: rgba(255, 255, 255, 0.04);
  }
  .result:hover,
  .result:focus {
    background: rgba(255, 255, 255, 0.09);
  }
  .result img,
  .noimg {
    flex: none;
    width: 4.2rem;
    aspect-ratio: 2 / 3;
    object-fit: cover;
    border-radius: 0.35rem;
    background: var(--surface);
  }
  .rt {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 0.2rem;
  }
  .clamp3 {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .pickme {
    color: var(--gold);
    opacity: 0;
  }
  .result:hover .pickme,
  .result:focus .pickme {
    opacity: 1;
  }
  .field {
    display: grid;
    gap: 0.35rem;
  }
  .field > span {
    font-weight: 600;
    font-size: 0.92rem;
  }
  .area {
    min-height: 8rem;
    padding: 0.7rem 1rem;
    resize: vertical;
    line-height: 1.45;
    font: inherit;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.8rem 0.9rem;
    border-radius: var(--radius);
    background: rgba(255, 255, 255, 0.04);
    text-align: left;
  }
  .tl {
    flex: 1;
    display: grid;
    gap: 0.2rem;
  }
  .sw {
    flex: none;
    position: relative;
    width: 3.2rem;
    height: 1.8rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.2);
  }
  .sw i {
    position: absolute;
    top: 0.2rem;
    left: 0.2rem;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.2s ease;
  }
  .sw.on {
    background: var(--gold);
  }
  .sw.on i {
    transform: translateX(1.4rem);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
    gap: 0.6rem;
  }
  .grid.wide {
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  }
  .img {
    position: relative;
    display: grid;
    gap: 0.25rem;
    padding: 0.3rem;
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.04);
  }
  .img:hover,
  .img:focus {
    background: rgba(255, 255, 255, 0.1);
  }
  .img img {
    width: 100%;
    aspect-ratio: 2 / 3;
    object-fit: cover;
    border-radius: 0.35rem;
    background: var(--surface);
  }
  .wide .img img {
    aspect-ratio: 16 / 9;
    object-fit: contain;
  }
  .cap {
    font-size: 0.75rem;
    color: var(--text-3);
    text-align: left;
  }
  .spin {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 0.5rem;
  }
  .spinner.small {
    width: 1.6rem;
    height: 1.6rem;
  }
  @media (max-width: 700px) {
    .search,
    .two {
      grid-template-columns: 1fr;
    }
  }
</style>
