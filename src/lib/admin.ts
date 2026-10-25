import { jf } from './jellyfin';

// Administration du serveur Jellyfin (comptes administrateurs uniquement).

export type ServerInfo = {
  ServerName: string;
  Version: string;
  OperatingSystemDisplayName?: string;
  OperatingSystem?: string;
  HasPendingRestart?: boolean;
  CanSelfRestart?: boolean;
  LocalAddress?: string;
};

export type Session = {
  Id: string;
  UserName?: string;
  Client: string;
  DeviceName: string;
  LastActivityDate: string;
  NowPlayingItem?: { Id: string; Name: string; SeriesName?: string; RunTimeTicks?: number; Type: string };
  PlayState?: { PositionTicks?: number; IsPaused?: boolean; PlayMethod?: string };
  TranscodingInfo?: { VideoCodec?: string; AudioCodec?: string; Bitrate?: number; TranscodeReasons?: string[] };
};

export type Library = {
  Name: string;
  ItemId: string;
  CollectionType?: string;
  Locations: string[];
  RefreshProgress?: number;
  RefreshStatus?: string;
};

export type Policy = Record<string, unknown> & {
  IsAdministrator: boolean;
  IsDisabled: boolean;
  EnableRemoteAccess: boolean;
  EnableContentDownloading: boolean;
};

export type User = {
  Id: string;
  Name: string;
  PrimaryImageTag?: string;
  LastActivityDate?: string;
  HasPassword?: boolean;
  Policy: Policy;
};

export type Device = { Id: string; Name: string; AppName: string; AppVersion: string; LastUserName?: string; DateLastActivity: string };

export type Task = {
  Id: string;
  Name: string;
  Category: string;
  Description?: string;
  State: 'Idle' | 'Running' | 'Cancelling';
  CurrentProgressPercentage?: number;
  LastExecutionResult?: { EndTimeUtc: string; Status: string };
};

export type LogEntry = { Id: number; Name: string; ShortOverview?: string; Date: string; Severity: string; Type: string };

/** Extension installée sur le serveur. */
export type Plugin = {
  Id: string;
  Name: string;
  Version: string;
  Description?: string;
  CanUninstall: boolean;
  HasImage?: boolean;
  Status: 'Active' | 'Restart' | 'Deleted' | 'Superceded' | 'Malfunctioned' | 'NotSupported' | 'Disabled' | string;
};

/** Extension du catalogue (dépôts d'extensions) : noms de champs en minuscules dans l'API. */
export type Package = {
  name: string;
  guid: string;
  description?: string;
  overview?: string;
  owner?: string;
  category?: string;
  imageUrl?: string;
  versions: { version: string; targetAbi?: string; changelog?: string; repositoryName?: string; repositoryUrl?: string }[];
};

export type Repository = { Name: string; Url: string; Enabled: boolean };
export type ApiKey = { AccessToken: string; AppName: string; DateCreated: string };
export type LogFile = { Name: string; Size: number; DateModified: string };

/** Résultat de « Identifier » (TMDb, IMDb…). */
export type RemoteResult = {
  Name: string;
  ProductionYear?: number;
  PremiereDate?: string;
  ImageUrl?: string;
  Overview?: string;
  SearchProviderName?: string;
  ProviderIds?: Record<string, string>;
};
export type RemoteImage = { Url: string; ThumbnailUrl?: string; ProviderName?: string; Width?: number; Height?: number; Language?: string; CommunityRating?: number };
export type ImageKind = 'Primary' | 'Backdrop' | 'Logo' | 'Thumb';

/** « 10.11.2.0 » plus récent que « 10.9.0.0 » (comparaison nombre par nombre). */
export function newer(a: string, b: string) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

export const admin = {
  me: () => jf.get<User>('/Users/Me'),

  info: () => jf.get<ServerInfo>('/System/Info'),
  restart: () => jf.post('/System/Restart'),
  sessions: () => jf.get<Session[]>('/Sessions', { activeWithinSeconds: 960 }),
  stopSession: (id: string) => jf.post(`/Sessions/${id}/Playing/Stop`),
  message: (id: string, text: string) => jf.post(`/Sessions/${id}/Message`, { Header: 'Selvania Ciné', Text: text, TimeoutMs: 8000 }),

  libraries: () => jf.get<Library[]>('/Library/VirtualFolders'),
  counts: () => jf.get<{ MovieCount: number; SeriesCount: number; EpisodeCount: number }>('/Items/Counts'),
  scanAll: () => jf.post('/Library/Refresh'),
  scan: (itemId: string) =>
    jf.post(`/Items/${itemId}/Refresh`, undefined, {
      Recursive: true, MetadataRefreshMode: 'Default', ImageRefreshMode: 'Default', ReplaceAllMetadata: false, ReplaceAllImages: false,
    }),

  users: () => jf.get<User[]>('/Users'),
  createUser: (name: string, password: string) => jf.post<User>('/Users/New', { Name: name, Password: password }),
  deleteUser: (id: string) => jf.request('DELETE', `/Users/${id}`),
  setPolicy: (id: string, policy: Policy) => jf.post(`/Users/${id}/Policy`, policy),
  setPassword: (id: string, password: string) => jf.post(`/Users/${id}/Password`, { NewPw: password, ResetPassword: false }),

  devices: () => jf.get<{ Items: Device[] }>('/Devices').then((r) => r.Items),
  deleteDevice: (id: string) => jf.request('DELETE', '/Devices', { query: { id } }),

  tasks: () => jf.get<Task[]>('/ScheduledTasks', { isHidden: false }),
  runTask: (id: string) => jf.post(`/ScheduledTasks/Running/${id}`),
  stopTask: (id: string) => jf.request('DELETE', `/ScheduledTasks/Running/${id}`),

  activity: () => jf.get<{ Items: LogEntry[] }>('/System/ActivityLog/Entries', { startIndex: 0, limit: 80 }).then((r) => r.Items),

  config: () => jf.get<Record<string, any>>('/System/Configuration'),
  saveConfig: (c: Record<string, any>) => jf.post('/System/Configuration', c),
  encoding: () => jf.get<Record<string, any>>('/System/Configuration/encoding'),
  saveEncoding: (c: Record<string, any>) => jf.post('/System/Configuration/encoding', c),
  branding: () => jf.get<{ LoginDisclaimer?: string; CustomCss?: string; SplashscreenEnabled?: boolean }>('/System/Configuration/branding'),
  saveBranding: (b: Record<string, unknown>) => jf.post('/System/Configuration/branding', b),
  network: () => jf.get<Record<string, any>>('/System/Configuration/network'),
  saveNetwork: (c: Record<string, any>) => jf.post('/System/Configuration/network', c),

  // Extensions
  plugins: () => jf.get<Plugin[]>('/Plugins'),
  enablePlugin: (p: Plugin) => jf.post(`/Plugins/${p.Id}/${p.Version}/Enable`),
  disablePlugin: (p: Plugin) => jf.post(`/Plugins/${p.Id}/${p.Version}/Disable`),
  uninstallPlugin: (p: Plugin) => jf.request('DELETE', `/Plugins/${p.Id}/${p.Version}`),
  packages: () => jf.get<Package[]>('/Packages'),
  install: (pkg: Package, version = pkg.versions[0]) =>
    jf.post(`/Packages/Installed/${encodeURIComponent(pkg.name)}`, undefined, {
      assemblyGuid: pkg.guid, version: version?.version, repositoryUrl: version?.repositoryUrl,
    }),
  repositories: () => jf.get<Repository[]>('/Repositories'),
  saveRepositories: (list: Repository[]) => jf.post('/Repositories', list),

  // Clés d'API (applis et scripts qui accèdent au serveur)
  apiKeys: () => jf.get<{ Items: ApiKey[] }>('/Auth/Keys').then((r) => r.Items),
  createApiKey: (app: string) => jf.post('/Auth/Keys', undefined, { app }),
  deleteApiKey: (key: string) => jf.request('DELETE', `/Auth/Keys/${key}`),

  // Journaux du serveur (fichiers)
  logFiles: () => jf.get<LogFile[]>('/System/Logs'),
  logFile: (name: string) => jf.get<string>('/System/Logs/Log', { name }),

  // Fiche d'un titre : identifier, modifier, images, actualiser
  /** Recherche chez les fournisseurs de métadonnées (type : Movie, Series, BoxSet…). */
  identify: (itemId: string, type: string, name: string, year?: number, providerIds: Record<string, string> = {}) =>
    jf.post<RemoteResult[]>(`/Items/RemoteSearch/${type}`, {
      SearchInfo: { Name: name, Year: year || undefined, ProviderIds: providerIds },
      ItemId: itemId,
      IncludeDisabledProviders: false,
    }),
  /** Applique le résultat choisi ; le serveur relit ensuite toute la fiche (quelques secondes). */
  applyIdentity: (itemId: string, result: RemoteResult) =>
    jf.post(`/Items/RemoteSearch/Apply/${itemId}`, result, { replaceAllImages: true }),
  refresh: (itemId: string, replaceAll: boolean) =>
    jf.post(`/Items/${itemId}/Refresh`, undefined, {
      Recursive: true,
      MetadataRefreshMode: 'FullRefresh',
      ImageRefreshMode: 'FullRefresh',
      ReplaceAllMetadata: replaceAll,
      ReplaceAllImages: replaceAll,
    }),
  /** La fiche complète est renvoyée telle quelle avec les champs modifiés (comme le tableau de bord de Jellyfin). */
  updateItem: (itemId: string, dto: Record<string, unknown>) => jf.post(`/Items/${itemId}`, dto),
  remoteImages: (itemId: string, type: ImageKind) =>
    jf.get<{ Images: RemoteImage[] }>(`/Items/${itemId}/RemoteImages`, { type, includeAllLanguages: true, limit: 60 }).then((r) => r.Images),
  downloadImage: (itemId: string, type: ImageKind, url: string) =>
    jf.post(`/Items/${itemId}/RemoteImages/Download`, undefined, { type, imageUrl: url }),
};

// ---------- Thème Selvania pour l'interface web de Jellyfin (tableau de bord compris) ----------

const START = '/* --- Selvania Ciné : début du thème (ajouté par Ciné) --- */';
const END = '/* --- Selvania Ciné : fin du thème --- */';

export const SELVANIA_CSS = `${START}
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap');
:root {
  --selvania-bg: #0b0c0f;
  --selvania-surface: #16181d;
  --selvania-line: rgba(255, 255, 255, 0.08);
  --selvania-gold: #f7a01f;
  --selvania-gold-grad: linear-gradient(135deg, #ffc350 0%, #fb9a22 45%, #f2690c 100%);
  --mui-palette-primary-main: #f7a01f;
  --mui-palette-primary-dark: #f2690c;
  --mui-palette-background-default: #0b0c0f;
  --mui-palette-background-paper: #16181d;
}
body, .MuiTypography-root, button, input, select, textarea { font-family: 'Inter', system-ui, sans-serif !important; }
body, .backgroundContainer, .mainAnimatedPage, .skinBody, .MuiPaper-root.MuiDrawer-paper { background-color: var(--selvania-bg) !important; }
.skinHeader, .MuiAppBar-root { background: rgba(11, 12, 15, 0.96) !important; box-shadow: 0 1px 0 var(--selvania-line) !important; }
.mainDrawer, .MuiDrawer-paper { background: #101216 !important; border-right: 1px solid var(--selvania-line) !important; }
.paperList, .card .cardBox, .MuiCard-root, .MuiPaper-root:not(.MuiAppBar-root) { background-color: var(--selvania-surface) !important; border-radius: 0.6rem; }
.button-submit, .raised.button-submit, .MuiButton-containedPrimary, .emby-button.raised.block.button-submit {
  background: var(--selvania-gold-grad) !important; color: #1b1104 !important; font-weight: 700 !important; border-radius: 0.5rem !important;
}
a, .button-link, .sectionTitle-link, .MuiLink-root, .navMenuOption-selected, .Mui-selected .MuiListItemText-primary { color: var(--selvania-gold) !important; }
.navMenuOption-selected, .MuiListItemButton-root.Mui-selected { background: rgba(247, 160, 31, 0.14) !important; }
.emby-checkbox:checked + span + .checkboxOutline, .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track { background-color: var(--selvania-gold) !important; border-color: var(--selvania-gold) !important; }
.MuiSwitch-switchBase.Mui-checked, .MuiCheckbox-root.Mui-checked, .MuiRadio-root.Mui-checked { color: var(--selvania-gold) !important; }
.emby-input:focus, .emby-select-withcolor:focus, .emby-textarea:focus, .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline { border-color: var(--selvania-gold) !important; }
.itemProgressBarForeground, .playedIndicator, .countIndicator, .MuiLinearProgress-bar { background: var(--selvania-gold-grad) !important; }
.sectionTitle, h1, h2, h3, .MuiTypography-h1, .MuiTypography-h2, .MuiTypography-h3, .MuiTypography-h4 { font-weight: 700 !important; letter-spacing: -0.01em; }
.pageTitleWithDefaultLogo, .pageTitleWithLogo { filter: sepia(1) saturate(4) hue-rotate(-10deg); }
${END}`;

/** Le thème est ajouté entre deux repères : le reste du CSS personnalisé du serveur est conservé. */
export function withTheme(css: string | undefined, on: boolean) {
  const rest = (css ?? '').replace(new RegExp(`\\n?${literal(START)}[\\s\\S]*?${literal(END)}\\n?`), '').trim();
  return on ? `${rest}${rest ? '\n\n' : ''}${SELVANIA_CSS}` : rest;
}

export const hasTheme = (css: string | undefined) => (css ?? '').includes(START);

function literal(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
