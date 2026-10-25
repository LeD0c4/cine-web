<script lang="ts">
  import {
    mdiServerNetwork, mdiFolderMultipleOutline, mdiAccountMultipleOutline, mdiDevices, mdiTimerCogOutline,
    mdiTextBoxOutline, mdiTuneVariant, mdiRefresh, mdiStop, mdiPlay, mdiMessageTextOutline, mdiRestart,
    mdiAccountPlusOutline, mdiDeleteOutline, mdiKeyOutline, mdiPalette, mdiPuzzleOutline, mdiKeyChainVariant,
    mdiDownload, mdiUpdate, mdiPlus, mdiContentCopy, mdiFileDocumentOutline, mdiAlertCircleOutline, mdiPencilOutline,
  } from '@mdi/js';
  import ItemAdmin from '../components/ItemAdmin.svelte';
  import { router, links } from '../lib/router.svelte';
  import { posterOf, type Item } from '../lib/jellyfin';
  import {
    admin, withTheme, hasTheme, newer,
    type ServerInfo, type Session, type Library, type User, type Device, type Task, type LogEntry,
    type Plugin, type Package, type Repository, type ApiKey, type LogFile, type Incomplete,
  } from '../lib/admin';
  import { session } from '../lib/session.svelte';
  import { TICKS } from '../lib/jellyfin';
  import { clock } from '../lib/format';
  import { handle } from '../lib/errors';
  import Icon from '../components/Icon.svelte';

  type Tab = 'server' | 'libraries' | 'incomplete' | 'users' | 'plugins' | 'devices' | 'tasks' | 'log' | 'keys' | 'settings';
  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'server', label: 'Serveur', icon: mdiServerNetwork },
    { id: 'libraries', label: 'Médiathèques', icon: mdiFolderMultipleOutline },
    { id: 'incomplete', label: 'À compléter', icon: mdiAlertCircleOutline },
    { id: 'users', label: 'Utilisateurs', icon: mdiAccountMultipleOutline },
    { id: 'plugins', label: 'Extensions', icon: mdiPuzzleOutline },
    { id: 'devices', label: 'Appareils', icon: mdiDevices },
    { id: 'tasks', label: 'Tâches', icon: mdiTimerCogOutline },
    { id: 'log', label: 'Journal', icon: mdiTextBoxOutline },
    { id: 'keys', label: 'Clés d’API', icon: mdiKeyChainVariant },
    { id: 'settings', label: 'Réglages', icon: mdiTuneVariant },
  ];
  let tab = $state<Tab>('server');

  let error = $state('');
  let notice = $state('');
  let busy = $state('');

  // Actions risquées : un premier appui arme le bouton, le second confirme (pas de fenêtre système).
  let armed = $state('');
  function confirmed(key: string) {
    if (armed === key) {
      armed = '';
      return true;
    }
    armed = key;
    setTimeout(() => armed === key && (armed = ''), 4000);
    return false;
  }

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    busy = key;
    error = '';
    try {
      await fn();
      if (done) flash(done);
      await load();
    } catch (err) {
      error = handle(err);
    } finally {
      busy = '';
    }
  }
  function flash(text: string) {
    notice = text;
    setTimeout(() => notice === text && (notice = ''), 3500);
  }

  // ---------- Données de l'onglet ----------
  let info = $state<ServerInfo | null>(null);
  let sessions = $state<Session[]>([]);
  let libraries = $state<Library[]>([]);
  let counts = $state<{ MovieCount: number; SeriesCount: number; EpisodeCount: number } | null>(null);
  let users = $state<User[]>([]);
  let devices = $state<Device[]>([]);
  let tasks = $state<Task[]>([]);
  let log = $state<LogEntry[]>([]);
  let config = $state<Record<string, any> | null>(null);
  let encoding = $state<Record<string, any> | null>(null);
  let network = $state<Record<string, any> | null>(null);
  let themeOn = $state(false);
  let plugins = $state<Plugin[]>([]);
  let packages = $state<Package[] | null>(null);
  let repos = $state<Repository[]>([]);
  let keys = $state<ApiKey[]>([]);
  let logFiles = $state<LogFile[]>([]);
  let incomplete = $state<Incomplete[] | null>(null);

  async function load() {
    try {
      if (tab === 'server') [info, sessions] = await Promise.all([admin.info(), admin.sessions()]);
      else if (tab === 'libraries') [libraries, counts] = await Promise.all([admin.libraries(), admin.counts()]);
      else if (tab === 'users') [users, libraries] = await Promise.all([admin.users(), admin.libraries()]);
      else if (tab === 'incomplete') incomplete = await admin.incomplete();
      else if (tab === 'plugins') {
        [plugins, repos, info] = await Promise.all([admin.plugins(), admin.repositories(), admin.info()]);
        // Le catalogue (tous les dépôts) est long à lire : une fois par visite de l'onglet.
        if (!packages) packages = await admin.packages().catch(() => []);
      } else if (tab === 'devices') devices = await admin.devices();
      else if (tab === 'tasks') tasks = await admin.tasks();
      else if (tab === 'log') [log, logFiles] = await Promise.all([admin.activity(), admin.logFiles().catch(() => [])]);
      else if (tab === 'keys') keys = await admin.apiKeys();
      else if (tab === 'settings') {
        const [c, e, b, n] = await Promise.all([admin.config(), admin.encoding(), admin.branding(), admin.network().catch(() => null)]);
        config = c;
        encoding = e;
        network = n;
        proxies = (n?.KnownProxies ?? []).join(', ');
        themeOn = hasTheme(b.CustomCss);
      }
    } catch (err) {
      error = handle(err);
    }
  }

  // Rafraîchissement : lectures en cours, analyses et tâches avancent pendant qu'on regarde.
  $effect(() => {
    void tab;
    error = '';
    load();
    const live = tab === 'server' || tab === 'libraries' || tab === 'tasks';
    if (!live) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  });

  const ago = (d?: string) => {
    if (!d) return '';
    const m = Math.round((Date.now() - Date.parse(d)) / 60000);
    if (m < 1) return 'à l’instant';
    if (m < 60) return `il y a ${m} min`;
    if (m < 1440) return `il y a ${Math.round(m / 60)} h`;
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  // ---------- Utilisateurs ----------
  let newName = $state('');
  let newPassword = $state('');
  let pwFor = $state('');
  let pwValue = $state('');
  const me = $derived(session.current?.userId);

  async function togglePolicy(u: User, key: 'IsAdministrator' | 'IsDisabled' | 'EnableRemoteAccess' | 'EnableContentDownloading') {
    await act(`${u.Id}:${key}`, () => admin.setPolicy(u.Id, { ...u.Policy, [key]: !u.Policy[key] }));
  }

  // Médiathèques visibles par l'utilisateur : toutes, ou une sélection.
  const allFolders = (u: User) => u.Policy.EnableAllFolders !== false;
  const folders = (u: User) => (u.Policy.EnabledFolders as string[] | undefined) ?? [];
  async function setAllFolders(u: User, all: boolean) {
    const enabled = all ? [] : libraries.map((l) => l.ItemId);
    await act(`${u.Id}:folders`, () => admin.setPolicy(u.Id, { ...u.Policy, EnableAllFolders: all, EnabledFolders: enabled }));
  }
  async function toggleFolder(u: User, id: string) {
    const list = folders(u);
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    await act(`${u.Id}:folders`, () => admin.setPolicy(u.Id, { ...u.Policy, EnableAllFolders: false, EnabledFolders: next }));
  }

  // ---------- À compléter ----------
  let incFilter = $state('');
  let fixing = $state<Item | null>(null);
  let retry = $state<{ done: number; total: number } | null>(null);
  const shown = $derived((incomplete ?? []).filter((e) => !incFilter || e.reasons.includes(incFilter)));
  const TYPE: Record<string, string> = { Movie: 'Film', Series: 'Série', BoxSet: 'Collection' };
  const fileName = (path?: string) => path?.split(/[\\/]/).filter(Boolean).pop() ?? '';
  /** Nouvelle tentative d'identification pour tout ce qui est affiché (compléter sans rien écraser). */
  async function retryAll() {
    const list = shown.map((e) => e.item.Id);
    retry = { done: 0, total: list.length };
    for (const id of list) {
      await admin.refresh(id, false).catch(() => {});
      retry = { done: retry.done + 1, total: list.length };
    }
    flash(`Identification relancée pour ${list.length} titre${list.length > 1 ? 's' : ''} : la liste se met à jour dans quelques minutes.`);
    retry = null;
    setTimeout(load, 15000);
  }

  // ---------- Extensions ----------
  const PLUGIN_STATUS: Record<string, string> = {
    Active: 'Active', Disabled: 'Désactivée', Restart: 'Redémarrage nécessaire', Malfunctioned: 'En erreur',
    NotSupported: 'Non compatible', Superceded: 'Remplacée', Deleted: 'Supprimée au redémarrage',
  };
  const guid = (id: string) => id.replace(/-/g, '').toLowerCase();
  const installed = $derived(new Set(plugins.map((p) => guid(p.Id))));
  /** Version plus récente dans le catalogue pour une extension installée. */
  function update(p: Plugin) {
    const pkg = packages?.find((x) => guid(x.guid) === guid(p.Id));
    const latest = pkg?.versions[0];
    return pkg && latest && newer(latest.version, p.Version) ? { pkg, version: latest } : null;
  }
  let pkgQuery = $state('');
  let pkgCategory = $state('');
  const categories = $derived([...new Set((packages ?? []).map((x) => x.category).filter(Boolean) as string[])].sort());
  const catalog = $derived(
    (packages ?? [])
      .filter((x) => !installed.has(guid(x.guid)))
      .filter((x) => !pkgCategory || x.category === pkgCategory)
      .filter((x) => !pkgQuery.trim() || `${x.name} ${x.description ?? ''} ${x.overview ?? ''}`.toLowerCase().includes(pkgQuery.trim().toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  let repoName = $state('');
  let repoUrl = $state('');
  async function saveRepos(list: Repository[], done: string) {
    await act('repos', async () => {
      await admin.saveRepositories(list);
      packages = null; // le catalogue change avec les dépôts
    }, done);
  }

  // ---------- Clés d'API ----------
  let keyName = $state('');
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash('Clé copiée');
    } catch {
      flash('Copie impossible : sélectionnez la clé à la main');
    }
  }

  // ---------- Journal ----------
  let logView = $state<'activity' | 'files'>('activity');
  let logName = $state('');
  let logText = $state('');
  async function openLog(name: string) {
    logName = name;
    logText = 'Chargement…';
    try {
      const text = await admin.logFile(name);
      // Les fichiers peuvent être gros : les 600 dernières lignes suffisent pour un diagnostic.
      logText = String(text).split('\n').slice(-600).join('\n');
    } catch (err) {
      logText = handle(err);
    }
  }
  const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} ko`);

  // ---------- Réseau ----------
  let proxies = $state('');
  async function saveNetwork() {
    const n = network;
    if (!n) return;
    const list = proxies.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    await act('network', () => admin.saveNetwork({ ...$state.snapshot(n), KnownProxies: list }), 'Réglages réseau enregistrés (redémarrage du serveur conseillé)');
  }

  // ---------- Réglages ----------
  const BITRATES = [
    { label: 'Illimité', bps: 0 },
    { label: '40 Mb/s', bps: 40_000_000 },
    { label: '20 Mb/s', bps: 20_000_000 },
    { label: '10 Mb/s', bps: 10_000_000 },
    { label: '8 Mb/s', bps: 8_000_000 },
    { label: '4 Mb/s', bps: 4_000_000 },
  ];
  const ACCEL = [
    { value: 'none', label: 'Aucune (processeur)' },
    { value: 'qsv', label: 'Intel Quick Sync' },
    { value: 'vaapi', label: 'VA-API (Intel / AMD)' },
    { value: 'nvenc', label: 'NVIDIA NVENC' },
    { value: 'amf', label: 'AMD AMF' },
    { value: 'videotoolbox', label: 'Apple VideoToolbox' },
    { value: 'rkmpp', label: 'Rockchip MPP' },
  ];

  async function saveConfig() {
    const c = config;
    if (c) await act('config', () => admin.saveConfig($state.snapshot(c)), 'Réglages du serveur enregistrés');
  }
  async function saveEncoding() {
    const e = encoding;
    if (e) await act('encoding', () => admin.saveEncoding($state.snapshot(e)), 'Réglages de conversion enregistrés');
  }
  async function toggleTheme() {
    await act('theme', async () => {
      const b = await admin.branding();
      await admin.saveBranding({ ...b, CustomCss: withTheme(b.CustomCss, !themeOn) });
    }, themeOn ? 'Thème Selvania retiré de Jellyfin' : 'Thème Selvania appliqué à Jellyfin (rechargez la page Jellyfin)');
  }

  const severity = (s: string) => (s === 'Error' || s === 'Fatal' ? 'err' : s === 'Warning' || s === 'Warn' ? 'warn' : '');
</script>

<div class="admin fade-in">
  <header class="head">
    <h1>Administration</h1>
    {#if info}<span class="hint">{info.ServerName} · Jellyfin {info.Version}</span>{/if}
  </header>

  <nav class="tabs" aria-label="Sections">
    {#each TABS as t, i (t.id)}
      <button class="tab" class:on={tab === t.id} onclick={() => (tab = t.id)} data-autofocus={i === 0 ? '' : undefined}>
        <Icon path={t.icon} size={1.15} /> {t.label}
      </button>
    {/each}
  </nav>

  {#if fixing}
    <ItemAdmin item={fixing} onclose={() => { fixing = null; load(); }} onchanged={() => {}} />
  {/if}

  {#if error}<p class="msg err">{error}</p>{/if}
  {#if notice}<p class="msg ok">{notice}</p>{/if}

  {#if tab === 'server'}
    <section class="grid2">
      <div class="card">
        <h2>Serveur</h2>
        {#if info}
          <dl>
            <dt>Nom</dt><dd>{info.ServerName}</dd>
            <dt>Version</dt><dd>Jellyfin {info.Version}</dd>
            <dt>Système</dt><dd>{info.OperatingSystemDisplayName ?? info.OperatingSystem ?? '—'}</dd>
            {#if info.LocalAddress}<dt>Adresse locale</dt><dd>{info.LocalAddress}</dd>{/if}
          </dl>
          {#if info.HasPendingRestart}<p class="warn-box">Un redémarrage est nécessaire pour appliquer des changements.</p>{/if}
          {#if info.CanSelfRestart !== false}
            <button class="btn glass" class:danger={armed === 'restart'} disabled={busy === 'restart'}
              onclick={() => confirmed('restart') && act('restart', admin.restart, 'Redémarrage du serveur demandé')}>
              <Icon path={mdiRestart} size={1.2} /> {armed === 'restart' ? 'Confirmer le redémarrage' : 'Redémarrer le serveur'}
            </button>
          {/if}
        {:else}
          <div class="spinner small"></div>
        {/if}
      </div>

      <div class="card">
        <h2>En ce moment</h2>
        {#each sessions.filter((s) => s.NowPlayingItem) as s (s.Id)}
          {@const it = s.NowPlayingItem!}
          {@const pos = (s.PlayState?.PositionTicks ?? 0) / TICKS}
          {@const dur = (it.RunTimeTicks ?? 0) / TICKS}
          <div class="play">
            <div class="pl-t">
              <b class="ellipsis">{it.SeriesName ? `${it.SeriesName} — ${it.Name}` : it.Name}</b>
              <span class="hint">
                {s.UserName} · {s.DeviceName} ({s.Client}) · {s.PlayState?.IsPaused ? 'en pause' : 'en lecture'}
                · {s.PlayState?.PlayMethod === 'Transcode' ? 'converti' : 'direct'}
              </span>
              {#if dur}
                <div class="bar"><span style:width="{Math.min(100, (pos / dur) * 100)}%"></span></div>
                <span class="hint small">{clock(pos)} / {clock(dur)}</span>
              {/if}
            </div>
            <div class="pl-a">
              <button class="ib" title="Envoyer un message" onclick={() => act(`msg:${s.Id}`, () => admin.message(s.Id, 'Message de l’administrateur Selvania Ciné'), 'Message envoyé')}>
                <Icon path={mdiMessageTextOutline} size={1.3} />
              </button>
              <button class="ib" title="Arrêter la lecture" onclick={() => act(`stop:${s.Id}`, () => admin.stopSession(s.Id), 'Lecture arrêtée')}>
                <Icon path={mdiStop} size={1.3} />
              </button>
            </div>
          </div>
        {:else}
          <p class="hint">Personne ne regarde en ce moment.</p>
        {/each}
        {#if sessions.length}
          <p class="hint small">{sessions.length} appareil{sessions.length > 1 ? 's' : ''} connecté{sessions.length > 1 ? 's' : ''} ces 15 dernières minutes.</p>
        {/if}
      </div>
    </section>
  {:else if tab === 'libraries'}
    <section class="card">
      <div class="row-h">
        <h2>Médiathèques</h2>
        <button class="btn gold" disabled={busy === 'scanAll'} onclick={() => act('scanAll', admin.scanAll, 'Analyse de toutes les médiathèques lancée')}>
          <Icon path={mdiRefresh} size={1.2} /> Tout analyser
        </button>
      </div>
      {#if counts}
        <p class="hint">{counts.MovieCount} films · {counts.SeriesCount} séries · {counts.EpisodeCount} épisodes</p>
      {/if}
      {#each libraries as l (l.ItemId)}
        <div class="line">
          <div class="lt">
            <b>{l.Name}</b>
            <span class="hint small ellipsis">{l.Locations.join(' · ')}</span>
            {#if l.RefreshStatus === 'Active' && l.RefreshProgress !== undefined}
              <div class="bar"><span style:width="{l.RefreshProgress}%"></span></div>
            {/if}
          </div>
          <button class="btn glass small" disabled={busy === `scan:${l.ItemId}`} onclick={() => act(`scan:${l.ItemId}`, () => admin.scan(l.ItemId), `Analyse de « ${l.Name} » lancée`)}>
            <Icon path={mdiRefresh} size={1.1} /> Analyser
          </button>
        </div>
      {/each}
    </section>
  {:else if tab === 'users'}
    <section class="card">
      <h2>Utilisateurs</h2>
      {#each users as u (u.Id)}
        <div class="user">
          <div class="u-h">
            <span class="initial">{u.Name.charAt(0).toUpperCase()}</span>
            <div class="lt">
              <b>{u.Name}{u.Id === me ? ' (vous)' : ''}</b>
              <span class="hint small">{u.LastActivityDate ? `Vu ${ago(u.LastActivityDate)}` : 'Jamais connecté'}{u.HasPassword === false ? ' · sans mot de passe' : ''}</span>
            </div>
          </div>
          <div class="chips">
            <button class="opt" class:on={u.Policy.IsAdministrator} disabled={u.Id === me} onclick={() => togglePolicy(u, 'IsAdministrator')}>Administrateur</button>
            <button class="opt" class:on={u.Policy.EnableRemoteAccess} onclick={() => togglePolicy(u, 'EnableRemoteAccess')}>Accès à distance</button>
            <button class="opt" class:on={u.Policy.EnableContentDownloading} onclick={() => togglePolicy(u, 'EnableContentDownloading')}>Téléchargements</button>
            <button class="opt" class:off={u.Policy.IsDisabled} disabled={u.Id === me} onclick={() => togglePolicy(u, 'IsDisabled')}>{u.Policy.IsDisabled ? 'Désactivé' : 'Actif'}</button>
          </div>
          {#if libraries.length}
            <div class="chips libs">
              <span class="hint small">Médiathèques :</span>
              <button class="opt" class:on={allFolders(u)} onclick={() => setAllFolders(u, !allFolders(u))}>Toutes</button>
              {#if !allFolders(u)}
                {#each libraries as l (l.ItemId)}
                  <button class="opt" class:on={folders(u).includes(l.ItemId)} onclick={() => toggleFolder(u, l.ItemId)}>{l.Name}</button>
                {/each}
              {/if}
            </div>
          {/if}
          <div class="u-a">
            {#if pwFor === u.Id}
              <input class="input small-in" type="password" placeholder="Nouveau mot de passe" bind:value={pwValue} autocomplete="new-password" />
              <button class="btn gold small" disabled={!pwValue} onclick={() => act(`pw:${u.Id}`, async () => { await admin.setPassword(u.Id, pwValue); pwFor = ''; pwValue = ''; }, 'Mot de passe changé')}>Enregistrer</button>
              <button class="btn glass small" onclick={() => { pwFor = ''; pwValue = ''; }}>Annuler</button>
            {:else}
              <button class="btn glass small" onclick={() => { pwFor = u.Id; pwValue = ''; }}><Icon path={mdiKeyOutline} size={1.1} /> Mot de passe</button>
              {#if u.Id !== me}
                <button class="btn glass small" class:danger={armed === `del:${u.Id}`} onclick={() => confirmed(`del:${u.Id}`) && act(`del:${u.Id}`, () => admin.deleteUser(u.Id), `${u.Name} supprimé`)}>
                  <Icon path={mdiDeleteOutline} size={1.1} /> {armed === `del:${u.Id}` ? 'Confirmer' : 'Supprimer'}
                </button>
              {/if}
            {/if}
          </div>
        </div>
      {/each}

      <h3>Nouvel utilisateur</h3>
      <div class="new">
        <input class="input" placeholder="Nom" bind:value={newName} autocomplete="off" />
        <input class="input" type="password" placeholder="Mot de passe" bind:value={newPassword} autocomplete="new-password" />
        <button class="btn gold" disabled={!newName.trim() || busy === 'new'}
          onclick={() => act('new', async () => { await admin.createUser(newName.trim(), newPassword); newName = ''; newPassword = ''; }, 'Utilisateur créé')}>
          <Icon path={mdiAccountPlusOutline} size={1.2} /> Créer
        </button>
      </div>
    </section>
  {:else if tab === 'incomplete'}
    <section class="card">
      <div class="row-h">
        <h2>À compléter</h2>
        {#if shown.length}
          <button class="btn glass" disabled={!!retry} onclick={retryAll}>
            <Icon path={mdiRefresh} size={1.2} /> {retry ? `Relance… ${retry.done} / ${retry.total}` : `Relancer l’identification (${shown.length})`}
          </button>
        {/if}
      </div>
      <p class="hint">Les films et séries que Jellyfin n’a pas reconnus, ou sans résumé. « Corriger » ouvre l’identification : cherchez le bon titre et appliquez-le.</p>
      {#if incomplete === null}
        <div class="spinner small"></div>
      {:else if !incomplete.length}
        <p class="hint">Tout est complet : chaque film et chaque série a ses informations.</p>
      {:else}
        <div class="chips">
          {#each [['', 'Tout'], ['Non identifié', 'Non identifiés'], ['Sans résumé', 'Sans résumé'], ['Sans affiche', 'Sans affiche']] as [value, label] (value)}
            {@const n = value ? incomplete.filter((e) => e.reasons.includes(value)).length : incomplete.length}
            {#if n}<button class="opt" class:on={incFilter === value} onclick={() => (incFilter = value)}>{label} · {n}</button>{/if}
          {/each}
        </div>
        {#each shown as e (e.item.Id)}
          {@const poster = posterOf(e.item, 120)}
          <div class="line inc">
            {#if poster}<img class="poster" src={poster} alt="" loading="lazy" />{:else}<span class="poster none"></span>{/if}
            <div class="lt">
              <b class="ellipsis">{e.item.Name}{e.item.ProductionYear ? ` (${e.item.ProductionYear})` : ''}</b>
              <span class="hint small">{TYPE[e.item.Type] ?? e.item.Type}{fileName(e.item.Path) ? ` · ${fileName(e.item.Path)}` : ''}</span>
              <span class="reasons">{#each e.reasons as r (r)}<span class="status s-reason">{r}</span>{/each}</span>
            </div>
            <div class="pl-btns">
              <button class="btn gold small" onclick={() => (fixing = e.item)}><Icon path={mdiPencilOutline} size={1.1} /> Corriger</button>
              <button class="btn glass small" onclick={() => router.go(links.item(e.item.Id))}>Fiche</button>
            </div>
          </div>
        {/each}
      {/if}
    </section>
  {:else if tab === 'plugins'}
    {#if info?.HasPendingRestart}
      <p class="warn-box row-h">
        <span>Redémarrez le serveur pour appliquer les changements d’extensions.</span>
        <button class="btn glass small" class:danger={armed === 'restart'} onclick={() => confirmed('restart') && act('restart', admin.restart, 'Redémarrage du serveur demandé')}>
          <Icon path={mdiRestart} size={1.1} /> {armed === 'restart' ? 'Confirmer' : 'Redémarrer'}
        </button>
      </p>
    {/if}
    <section class="card">
      <h2>Extensions installées</h2>
      {#each plugins as p (p.Id + p.Version)}
        {@const up = update(p)}
        <div class="line">
          <div class="lt">
            <b>{p.Name} <span class="ver">{p.Version}</span></b>
            {#if p.Description}<span class="hint small clamp2">{p.Description}</span>{/if}
            <span class="status s-{p.Status}">{PLUGIN_STATUS[p.Status] ?? p.Status}</span>
          </div>
          <div class="pl-btns">
            {#if up}
              <button class="btn gold small" disabled={busy === `up:${p.Id}`} onclick={() => act(`up:${p.Id}`, () => admin.install(up.pkg, up.version), `${p.Name} ${up.version.version} installée : redémarrez le serveur`)}>
                <Icon path={mdiUpdate} size={1.1} /> {up.version.version}
              </button>
            {/if}
            {#if p.Status === 'Disabled'}
              <button class="btn glass small" onclick={() => act(`pl:${p.Id}`, () => admin.enablePlugin(p), `${p.Name} activée`)}>Activer</button>
            {:else if p.Status === 'Active'}
              <button class="btn glass small" onclick={() => act(`pl:${p.Id}`, () => admin.disablePlugin(p), `${p.Name} désactivée`)}>Désactiver</button>
            {/if}
            {#if p.CanUninstall}
              <button class="btn glass small" class:danger={armed === `rm:${p.Id}`} onclick={() => confirmed(`rm:${p.Id}`) && act(`rm:${p.Id}`, () => admin.uninstallPlugin(p), `${p.Name} désinstallée : redémarrez le serveur`)}>
                <Icon path={mdiDeleteOutline} size={1.1} /> {armed === `rm:${p.Id}` ? 'Confirmer' : 'Désinstaller'}
              </button>
            {/if}
          </div>
        </div>
      {:else}
        <p class="hint">Aucune extension installée.</p>
      {/each}
      <p class="hint small">Les réglages propres à chaque extension se font dans le tableau de bord de Jellyfin.</p>
    </section>

    <section class="card">
      <h2>Catalogue</h2>
      {#if packages === null}
        <div class="spinner small"></div>
      {:else}
        <input class="input" placeholder="Rechercher une extension…" bind:value={pkgQuery} />
        {#if categories.length > 1}
          <div class="chips">
            <button class="opt" class:on={!pkgCategory} onclick={() => (pkgCategory = '')}>Toutes</button>
            {#each categories as c (c)}
              <button class="opt" class:on={pkgCategory === c} onclick={() => (pkgCategory = pkgCategory === c ? '' : c)}>{c}</button>
            {/each}
          </div>
        {/if}
        {#each catalog as x (x.guid)}
          <div class="line">
            <div class="lt">
              <b>{x.name} <span class="ver">{x.versions[0]?.version ?? ''}</span></b>
              <span class="hint small clamp2">{x.description || x.overview || ''}</span>
              <span class="hint small">{[x.category, x.owner, x.versions[0]?.repositoryName].filter(Boolean).join(' · ')}</span>
            </div>
            <button class="btn glass small" disabled={!x.versions.length || busy === `inst:${x.guid}`} onclick={() => act(`inst:${x.guid}`, () => admin.install(x), `${x.name} installée : redémarrez le serveur`)}>
              <Icon path={mdiDownload} size={1.1} /> Installer
            </button>
          </div>
        {:else}
          <p class="hint">Aucune extension ne correspond.</p>
        {/each}
      {/if}
    </section>

    <section class="card">
      <h2>Dépôts d’extensions</h2>
      {#each repos as r, i (r.Url)}
        <div class="line">
          <div class="lt"><b>{r.Name}</b><span class="hint small ellipsis">{r.Url}</span></div>
          <button class="opt" class:on={r.Enabled} onclick={() => saveRepos(repos.map((x, j) => (j === i ? { ...x, Enabled: !x.Enabled } : x)), r.Enabled ? `${r.Name} désactivé` : `${r.Name} activé`)}>{r.Enabled ? 'Activé' : 'Désactivé'}</button>
          <button class="btn glass small" class:danger={armed === `repo:${r.Url}`} onclick={() => confirmed(`repo:${r.Url}`) && saveRepos(repos.filter((_, j) => j !== i), `${r.Name} retiré`)}>
            {armed === `repo:${r.Url}` ? 'Confirmer' : 'Retirer'}
          </button>
        </div>
      {/each}
      <div class="new">
        <input class="input" placeholder="Nom" bind:value={repoName} />
        <input class="input" placeholder="https://…/manifest.json" bind:value={repoUrl} />
        <button class="btn gold" disabled={!repoName.trim() || !/^https?:\/\//.test(repoUrl.trim())}
          onclick={() => saveRepos([...repos, { Name: repoName.trim(), Url: repoUrl.trim(), Enabled: true }], 'Dépôt ajouté').then(() => { repoName = ''; repoUrl = ''; })}>
          <Icon path={mdiPlus} size={1.2} /> Ajouter
        </button>
      </div>
    </section>
  {:else if tab === 'devices'}
    <section class="card">
      <h2>Appareils connectés</h2>
      <p class="hint">Déconnecter un appareil l’oblige à se reconnecter (identifiant et mot de passe).</p>
      {#each devices as d (d.Id)}
        <div class="line">
          <div class="lt">
            <b>{d.Name}</b>
            <span class="hint small">{d.AppName} {d.AppVersion} · {d.LastUserName ?? '—'} · {ago(d.DateLastActivity)}</span>
          </div>
          <button class="btn glass small" class:danger={armed === `dev:${d.Id}`} onclick={() => confirmed(`dev:${d.Id}`) && act(`dev:${d.Id}`, () => admin.deleteDevice(d.Id), `${d.Name} déconnecté`)}>
            {armed === `dev:${d.Id}` ? 'Confirmer' : 'Déconnecter'}
          </button>
        </div>
      {/each}
    </section>
  {:else if tab === 'tasks'}
    <section class="card">
      <h2>Tâches planifiées</h2>
      {#each tasks as t (t.Id)}
        <div class="line">
          <div class="lt">
            <b>{t.Name}</b>
            <span class="hint small">
              {t.Category}
              {#if t.LastExecutionResult} · dernière fois {ago(t.LastExecutionResult.EndTimeUtc)}{t.LastExecutionResult.Status !== 'Completed' ? ` (${t.LastExecutionResult.Status})` : ''}{/if}
            </span>
            {#if t.State === 'Running'}
              <div class="bar"><span style:width="{t.CurrentProgressPercentage ?? 0}%"></span></div>
            {/if}
          </div>
          {#if t.State === 'Running'}
            <button class="btn glass small" onclick={() => act(`task:${t.Id}`, () => admin.stopTask(t.Id))}><Icon path={mdiStop} size={1.1} /> Arrêter</button>
          {:else}
            <button class="btn glass small" disabled={t.State === 'Cancelling'} onclick={() => act(`task:${t.Id}`, () => admin.runTask(t.Id), `« ${t.Name} » lancée`)}><Icon path={mdiPlay} size={1.1} /> Lancer</button>
          {/if}
        </div>
      {/each}
    </section>
  {:else if tab === 'log'}
    <div class="chips sub">
      <button class="opt" class:on={logView === 'activity'} onclick={() => (logView = 'activity')}>Activité</button>
      <button class="opt" class:on={logView === 'files'} onclick={() => (logView = 'files')}>Fichiers du serveur</button>
    </div>
    {#if logView === 'activity'}
      <section class="card">
        <h2>Journal d’activité</h2>
        {#each log as e (e.Id)}
          <div class="log {severity(e.Severity)}">
            <span class="when">{new Date(e.Date).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            <span class="what"><b>{e.Name}</b>{#if e.ShortOverview}<span class="hint small">{e.ShortOverview}</span>{/if}</span>
          </div>
        {/each}
      </section>
    {:else}
      <section class="card">
        <h2>Fichiers de log</h2>
        {#each logFiles as f (f.Name)}
          <div class="line">
            <div class="lt"><b>{f.Name}</b><span class="hint small">{size(f.Size)} · modifié {ago(f.DateModified)}</span></div>
            <button class="btn glass small" class:gold={logName === f.Name} onclick={() => openLog(f.Name)}><Icon path={mdiFileDocumentOutline} size={1.1} /> Lire</button>
          </div>
        {:else}
          <p class="hint">Aucun fichier de log.</p>
        {/each}
        {#if logName}
          <h3>{logName} <span class="hint small">(fin du fichier)</span></h3>
          <pre class="logtext">{logText}</pre>
        {/if}
      </section>
    {/if}
  {:else if tab === 'keys'}
    <section class="card">
      <h2>Clés d’API</h2>
      <p class="hint">Pour les applis et scripts qui accèdent au serveur sans compte (domotique, outils de téléchargement…). Une clé donne un accès complet : ne la partagez pas.</p>
      {#each keys as k (k.AccessToken)}
        <div class="line">
          <div class="lt"><b>{k.AppName}</b><span class="hint small mono">{k.AccessToken} · créée {ago(k.DateCreated)}</span></div>
          <button class="ib" title="Copier la clé" onclick={() => copy(k.AccessToken)}><Icon path={mdiContentCopy} size={1.2} /></button>
          <button class="btn glass small" class:danger={armed === `key:${k.AccessToken}`} onclick={() => confirmed(`key:${k.AccessToken}`) && act(`key:${k.AccessToken}`, () => admin.deleteApiKey(k.AccessToken), `Clé « ${k.AppName} » révoquée`)}>
            {armed === `key:${k.AccessToken}` ? 'Confirmer' : 'Révoquer'}
          </button>
        </div>
      {:else}
        <p class="hint">Aucune clé.</p>
      {/each}
      <div class="new two-btn">
        <input class="input" placeholder="Nom de l’appli (ex. Home Assistant)" bind:value={keyName} />
        <button class="btn gold" disabled={!keyName.trim() || busy === 'newkey'} onclick={() => act('newkey', async () => { await admin.createApiKey(keyName.trim()); keyName = ''; }, 'Clé créée')}>
          <Icon path={mdiPlus} size={1.2} /> Créer une clé
        </button>
      </div>
    </section>
  {:else if tab === 'settings'}
    {#if config && encoding}
      <section class="grid2">
        <div class="card">
          <h2>Serveur</h2>
          <label class="field"><span>Nom du serveur</span><input class="input" bind:value={config.ServerName} /></label>
          <button class="toggle" role="switch" aria-checked={!!config.QuickConnectAvailable} onclick={() => (config!.QuickConnectAvailable = !config!.QuickConnectAvailable)}>
            <span class="tl"><b>Quick Connect</b><span class="hint">Connexion par code depuis la télé ou un téléphone, sans taper le mot de passe.</span></span>
            <span class="sw" class:on={config.QuickConnectAvailable}><i></i></span>
          </button>
          <div class="two">
            <label class="field"><span>Langue des fiches</span><input class="input" bind:value={config.PreferredMetadataLanguage} placeholder="fr" /></label>
            <label class="field"><span>Pays</span><input class="input" bind:value={config.MetadataCountryCode} placeholder="FR" /></label>
          </div>
          <div class="field">
            <span>Débit maximal hors de la maison (par appareil)</span>
            <div class="chips">
              {#each BITRATES as b (b.bps)}
                <button class="opt" class:on={(config.RemoteClientBitrateLimit ?? 0) === b.bps} onclick={() => (config!.RemoteClientBitrateLimit = b.bps)}>{b.label}</button>
              {/each}
            </div>
            <span class="hint small">Au-delà, le serveur convertit la vidéo pour ne pas saturer votre connexion.</span>
          </div>
          <button class="btn gold" disabled={busy === 'config'} onclick={saveConfig}>Enregistrer</button>
        </div>

        <div class="card">
          <h2>Conversion vidéo</h2>
          <label class="field">
            <span>Accélération matérielle</span>
            <select class="input" bind:value={encoding.HardwareAccelerationType}>
              {#each ACCEL as a (a.value)}<option value={a.value}>{a.label}</option>{/each}
            </select>
            <span class="hint small">À n’activer que si le serveur a la carte graphique correspondante (et l’accès dans Docker).</span>
          </label>
          {#each [
            ['EnableThrottling', 'Ralentir la conversion quand l’avance est suffisante', 'Moins de charge pour le serveur.'],
            ['EnableSegmentDeletion', 'Effacer les morceaux déjà regardés', 'Économise l’espace disque pendant la conversion.'],
            ['EnableTonemapping', 'Adapter le HDR aux écrans SDR', 'Couleurs correctes sur les télés et téléphones non HDR.'],
          ] as [key, label, help] (key)}
            <button class="toggle" role="switch" aria-checked={!!encoding[key]} onclick={() => (encoding![key] = !encoding![key])}>
              <span class="tl"><b>{label}</b><span class="hint">{help}</span></span>
              <span class="sw" class:on={encoding[key]}><i></i></span>
            </button>
          {/each}
          <button class="btn gold" disabled={busy === 'encoding'} onclick={saveEncoding}>Enregistrer</button>
        </div>

        {#if network}
          <div class="card">
            <h2>Réseau</h2>
            <dl>
              <dt>Port HTTP</dt><dd>{network.InternalHttpPort ?? '—'}{network.PublicHttpPort && network.PublicHttpPort !== network.InternalHttpPort ? ` (public ${network.PublicHttpPort})` : ''}</dd>
              <dt>HTTPS</dt><dd>{network.EnableHttps ? 'activé' : 'désactivé'}</dd>
              <dt>Accès à distance</dt><dd>{network.EnableRemoteAccess === false ? 'désactivé' : 'autorisé'}</dd>
              {#if network.BaseUrl}<dt>Chemin de base</dt><dd>{network.BaseUrl}</dd>{/if}
              {#if network.LocalNetworkSubnets?.length}<dt>Réseau local</dt><dd>{network.LocalNetworkSubnets.join(', ')}</dd>{/if}
            </dl>
            <label class="field">
              <span>Proxys connus</span>
              <input class="input" bind:value={proxies} placeholder="ex. 172.18.0.2, traefik" />
              <span class="hint small">Adresses ou noms des reverse proxys (Traefik, nginx…) devant Jellyfin : il peut alors voir la vraie adresse des appareils. Les ports et l’accès à distance se changent dans Jellyfin (une erreur couperait l’accès).</span>
            </label>
            <button class="btn gold" disabled={busy === 'network'} onclick={saveNetwork}>Enregistrer</button>
          </div>
        {/if}

        <div class="card">
          <h2>Apparence de Jellyfin</h2>
          <p class="hint">Donne à l’interface web de Jellyfin (et à son tableau de bord) les couleurs de Selvania Ciné : or, graphite, police Inter. Le reste de votre CSS personnalisé est conservé.</p>
          <button class="btn" class:gold={!themeOn} class:glass={themeOn} disabled={busy === 'theme'} onclick={toggleTheme}>
            <Icon path={mdiPalette} size={1.2} /> {themeOn ? 'Retirer le thème Selvania' : 'Appliquer le thème Selvania'}
          </button>
        </div>
      </section>
    {:else}
      <div class="spinner small"></div>
    {/if}
  {/if}
</div>

<style>
  .admin {
    padding: 6.5rem var(--pad) 4rem;
    min-height: 100vh;
  }
  .head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1.2rem;
  }
  h1 {
    font-size: 2rem;
    margin: 0;
  }
  h2 {
    font-size: 1.2rem;
    margin: 0 0 0.4rem;
  }
  h3 {
    font-size: 1.05rem;
    margin: 1.2rem 0 0.2rem;
  }
  /* Onglets : à la ligne quand il n'y a pas la place (pas de défilement caché qui rognerait le focus) */
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-bottom: 1.4rem;
  }
  .tab {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    height: 2.7rem;
    padding: 0 1rem;
    border-radius: 2rem;
    color: var(--text-2);
    background: rgba(255, 255, 255, 0.05);
    font-weight: 600;
  }
  .tab.on {
    color: #1b1104;
    background: var(--gold-grad);
  }
  .grid2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr));
    gap: 1rem;
    align-items: start;
  }
  .card {
    display: grid;
    gap: 0.8rem;
    padding: 1.3rem 1.4rem;
    border-radius: 0.8rem;
    background: var(--bg-2);
    border: 1px solid var(--line);
    max-width: 60rem;
  }
  .hint {
    color: var(--text-2);
    font-size: 0.93rem;
    line-height: 1.4;
    margin: 0;
  }
  .small {
    font-size: 0.84rem;
    color: var(--text-3);
  }
  .msg {
    padding: 0.7rem 1rem;
    border-radius: 0.5rem;
    margin: 0 0 1rem;
  }
  .msg.err {
    background: rgba(255, 95, 95, 0.12);
    color: var(--danger);
  }
  .msg.ok {
    background: var(--gold-soft);
    color: var(--gold);
  }
  .warn-box {
    padding: 0.6rem 0.8rem;
    border-radius: 0.5rem;
    background: var(--gold-soft);
    color: var(--gold);
    margin: 0;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.35rem 1rem;
    margin: 0;
  }
  dt {
    color: var(--text-3);
  }
  dd {
    margin: 0;
  }
  .btn.small {
    min-height: 2.4rem;
    padding: 0 0.9rem;
    font-size: 0.92rem;
  }
  .btn.danger {
    background: rgba(255, 95, 95, 0.2);
    color: var(--danger);
  }
  .btn:disabled {
    opacity: 0.55;
  }
  .row-h {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .line,
  .play {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.8rem 0;
    border-top: 1px solid var(--line);
  }
  .lt,
  .pl-t {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 0.2rem;
  }
  .pl-a {
    display: flex;
    gap: 0.2rem;
  }
  .ib {
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 50%;
    color: var(--text-2);
  }
  .ib:hover {
    color: var(--gold);
    background: rgba(255, 255, 255, 0.06);
  }
  .bar {
    height: 0.3rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
    margin-top: 0.2rem;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--gold-grad);
    transition: width 0.6s ease;
  }
  .user {
    display: grid;
    gap: 0.6rem;
    padding: 1rem 0;
    border-top: 1px solid var(--line);
  }
  .u-h {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }
  .initial {
    display: grid;
    place-items: center;
    flex: none;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 0.4rem;
    font-weight: 700;
    color: #1b1104;
    background: var(--gold-grad);
  }
  .chips,
  .u-a {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    align-items: center;
  }
  .opt {
    height: 2.3rem;
    padding: 0 0.85rem;
    border-radius: 2rem;
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: var(--text-3);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .opt.on {
    color: #1b1104;
    border-color: transparent;
    background: var(--gold-grad);
  }
  .opt.off {
    color: var(--danger);
    border-color: rgba(255, 95, 95, 0.4);
  }
  .opt:disabled {
    opacity: 0.6;
  }
  .small-in {
    width: auto;
    min-height: 2.4rem;
    flex: 1;
    min-width: 12rem;
  }
  .new {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 0.6rem;
  }
  .log {
    display: grid;
    grid-template-columns: 8.5rem 1fr;
    gap: 1rem;
    padding: 0.6rem 0;
    border-top: 1px solid var(--line);
  }
  .log.err b {
    color: var(--danger);
  }
  .log.warn b {
    color: var(--gold);
  }
  .when {
    color: var(--text-3);
    font-size: 0.86rem;
    font-variant-numeric: tabular-nums;
  }
  .what {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }
  .field {
    display: grid;
    gap: 0.4rem;
  }
  .field > span:first-child {
    font-weight: 600;
    font-size: 0.95rem;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }
  select.input {
    appearance: none;
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
    transition: background 0.2s ease;
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
  .ver {
    font-weight: 500;
    color: var(--text-3);
    font-size: 0.85rem;
  }
  .clamp2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .status {
    justify-self: start;
    font-size: 0.78rem;
    font-weight: 600;
    padding: 0.1rem 0.5rem;
    border-radius: 1rem;
    color: var(--text-2);
    background: rgba(255, 255, 255, 0.07);
  }
  .status.s-Active {
    color: #7bd88f;
    background: rgba(123, 216, 143, 0.12);
  }
  .status.s-Restart,
  .status.s-Deleted {
    color: var(--gold);
    background: var(--gold-soft);
  }
  .status.s-Malfunctioned,
  .status.s-NotSupported {
    color: var(--danger);
    background: rgba(255, 95, 95, 0.12);
  }
  .pl-btns {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    justify-content: flex-end;
  }
  .inc {
    align-items: center;
  }
  .poster {
    flex: none;
    width: 3rem;
    aspect-ratio: 2 / 3;
    object-fit: cover;
    border-radius: 0.3rem;
    background: var(--surface);
  }
  .reasons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .status.s-reason {
    color: var(--gold);
    background: var(--gold-soft);
  }
  .libs {
    margin-top: -0.2rem;
  }
  .sub {
    margin-bottom: 1rem;
  }
  .mono {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    word-break: break-all;
  }
  .logtext {
    max-height: 60vh;
    overflow: auto;
    margin: 0;
    padding: 0.9rem 1rem;
    border-radius: 0.5rem;
    background: #07080a;
    border: 1px solid var(--line);
    font: 0.78rem/1.45 ui-monospace, 'Cascadia Mono', Consolas, monospace;
    color: var(--text-2);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .two-btn {
    grid-template-columns: 1fr auto;
  }
  .warn-box.row-h {
    margin-bottom: 1rem;
  }
  .spinner.small {
    width: 1.6rem;
    height: 1.6rem;
  }
  @media (max-width: 700px) {
    .new,
    .two {
      grid-template-columns: 1fr;
    }
    .log {
      grid-template-columns: 1fr;
      gap: 0.2rem;
    }
    .line {
      flex-wrap: wrap;
    }
  }
</style>
