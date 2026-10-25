// Client de l'API Jellyfin.
// - Site (cine.example.com) : le serveur est relayé sous /jellyfin, à la même adresse que l'interface.
// - Appli (LG, Xbox… : « STANDALONE ») : l'interface est dans l'appli et parle au serveur choisi
//   au premier lancement (adresse complète, ex. https://jellyfin.exemple.fr).

export const STANDALONE = import.meta.env.VITE_STANDALONE === '1';

/** Début des adresses de l'API (relais du site, ou serveur choisi dans l'appli). */
export let JF = '/jellyfin';

export function setServer(url: string | undefined) {
  if (STANDALONE && url) JF = url.replace(/\/+$/, '');
}

/**
 * Adresse publique de Ciné, pour les appareils qui vont chercher la vidéo eux-mêmes (Chromecast).
 * Quand Ciné est relayé par une autre machine (http://localhost:88xx) ou ouvert par une adresse locale,
 * le Chromecast ne pourrait pas joindre cette adresse-là.
 */
const LOCAL_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/;
export const PUBLIC_ORIGIN =
  LOCAL_HOST.test(location.hostname) && !import.meta.env.DEV
    ? (import.meta.env.VITE_PUBLIC_URL as string | undefined) ?? location.origin
    : location.origin;

/** Adresse complète, pour ce qui est lu par un autre appareil (Chromecast, lecteur natif). */
export const absolute = (path: string) => (/^https?:\/\//.test(path) ? path : PUBLIC_ORIGIN + path);

/** Liaison en direct avec le serveur (WebSocket). */
export const socketUrl = (path: string) =>
  (/^https?:\/\//.test(JF) ? JF : `${location.protocol}//${location.host}${JF}`).replace(/^http/, 'ws') + path;

const CLIENT = 'Selvania Cine';
const VERSION = __APP_VERSION__;

export type UserData = {
  PlaybackPositionTicks?: number;
  PlayedPercentage?: number;
  Played?: boolean;
  IsFavorite?: boolean;
  UnplayedItemCount?: number;
};

export type MediaStream = {
  Index: number;
  Type: 'Video' | 'Audio' | 'Subtitle' | 'EmbeddedImage' | 'Data';
  Codec?: string;
  Language?: string;
  DisplayTitle?: string;
  Title?: string;
  IsDefault?: boolean;
  IsForced?: boolean;
  IsExternal?: boolean;
  IsTextSubtitleStream?: boolean;
  DeliveryMethod?: 'Encode' | 'Embed' | 'External' | 'Hls' | 'Drop';
  DeliveryUrl?: string;
  Width?: number;
  Height?: number;
  Channels?: number;
  VideoRangeType?: string;
};

export type MediaSource = {
  Id: string;
  Container?: string;
  ETag?: string;
  SupportsDirectPlay?: boolean;
  SupportsDirectStream?: boolean;
  SupportsTranscoding?: boolean;
  TranscodingUrl?: string;
  MediaStreams: MediaStream[];
  DefaultAudioStreamIndex?: number;
  DefaultSubtitleStreamIndex?: number;
  RunTimeTicks?: number;
};

export type Person = { Id: string; Name: string; Role?: string; Type?: string; PrimaryImageTag?: string };

export type Item = {
  Id: string;
  Name: string;
  Type: 'Movie' | 'Series' | 'Season' | 'Episode' | 'BoxSet' | 'CollectionFolder' | 'Folder' | string;
  CollectionType?: string;
  SeriesName?: string;
  SeriesId?: string;
  SeasonId?: string;
  SeasonName?: string;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  ProductionYear?: number;
  ProviderIds?: Record<string, string>;
  EndDate?: string;
  PremiereDate?: string;
  Status?: string;
  OfficialRating?: string;
  CommunityRating?: number;
  CriticRating?: number;
  RunTimeTicks?: number;
  Overview?: string;
  Taglines?: string[];
  Genres?: string[];
  Studios?: { Name: string }[];
  People?: Person[];
  ChildCount?: number;
  ImageTags?: Record<string, string>;
  BackdropImageTags?: string[];
  ParentBackdropItemId?: string;
  ParentBackdropImageTags?: string[];
  ParentLogoItemId?: string;
  ParentLogoImageTag?: string;
  ParentThumbItemId?: string;
  ParentThumbImageTag?: string;
  SeriesPrimaryImageTag?: string;
  PrimaryImageAspectRatio?: number;
  UserData?: UserData;
  MediaSources?: MediaSource[];
  MediaStreams?: MediaStream[];
  RemoteTrailers?: { Url: string; Name?: string }[];
};

export type Account = { userId: string; name: string; token: string; imageTag?: string; server?: string; serverName?: string };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function deviceId() {
  try {
    let id = localStorage.getItem('cine.deviceId');
    if (!id) {
      id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('cine.deviceId', id);
    }
    return id;
  } catch {
    return 'cine-web';
  }
}

export const DEVICE_ID = deviceId();
export const DEVICE_NAME = /SelvaniaTV/.test(navigator.userAgent)
  ? 'Selvania TV'
  : /Xbox/i.test(navigator.userAgent)
    ? 'Xbox'
    : /Web0S|webOS|NetCast/i.test(navigator.userAgent)
      ? 'Tele LG'
  : /Android/.test(navigator.userAgent)
    ? 'Android'
    : /iPhone|iPad/.test(navigator.userAgent)
      ? 'iOS'
      : 'Navigateur';

export const TICKS = 10_000_000;

export class Jellyfin {
  token = '';
  userId = '';

  private authHeader(anon = false) {
    const parts = [`Client="${CLIENT}"`, `Device="${DEVICE_NAME}"`, `DeviceId="${DEVICE_ID}"`, `Version="${VERSION}"`];
    if (this.token && !anon) parts.push(`Token="${this.token}"`);
    return `MediaBrowser ${parts.join(', ')}`;
  }

  async request<T = any>(method: string, path: string, opts: { query?: Record<string, unknown>; body?: unknown; keepalive?: boolean; anon?: boolean } = {}): Promise<T> {
    const url = new URL(JF + path, location.origin);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    const res = await fetch(url, {
      method,
      keepalive: opts.keepalive,
      headers: {
        Authorization: this.authHeader(opts.anon),
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ApiError(res.status, res.status === 401 ? 'Session expirée' : text.slice(0, 200) || `Erreur ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    const type = res.headers.get('content-type') ?? '';
    return (type.includes('json') ? res.json() : res.text()) as Promise<T>;
  }

  get = <T = any>(path: string, query?: Record<string, unknown>) => this.request<T>('GET', path, { query });
  post = <T = any>(path: string, body?: unknown, query?: Record<string, unknown>) => this.request<T>('POST', path, { body, query });

  // ---------- Connexion ----------

  serverInfo() {
    return this.request<{ ServerName: string; Version: string }>('GET', '/System/Info/Public', { anon: true });
  }

  async login(username: string, password: string): Promise<Account> {
    const r = await this.request('POST', '/Users/AuthenticateByName', { body: { Username: username, Pw: password }, anon: true });
    return { userId: r.User.Id, name: r.User.Name, token: r.AccessToken, imageTag: r.User.PrimaryImageTag, server: STANDALONE ? JF : undefined };
  }

  quickConnectEnabled() {
    return this.request<boolean>('GET', '/QuickConnect/Enabled', { anon: true }).catch(() => false);
  }

  quickConnectStart() {
    return this.request<{ Code: string; Secret: string }>('POST', '/QuickConnect/Initiate', { anon: true });
  }

  async quickConnectPoll(secret: string): Promise<Account | null> {
    const s = await this.request<{ Authenticated: boolean }>('GET', '/QuickConnect/Connect', { query: { secret }, anon: true });
    if (!s.Authenticated) return null;
    const r = await this.request('POST', '/Users/AuthenticateWithQuickConnect', { body: { Secret: secret }, anon: true });
    return { userId: r.User.Id, name: r.User.Name, token: r.AccessToken, imageTag: r.User.PrimaryImageTag, server: STANDALONE ? JF : undefined };
  }

  logout() {
    return this.post('/Sessions/Logout').catch(() => {});
  }

  // ---------- Bibliothèque ----------

  static FIELDS = ['Overview', 'Genres', 'PrimaryImageAspectRatio', 'ChildCount', 'DateCreated'];

  views() {
    return this.get<{ Items: Item[] }>('/UserViews', { userId: this.userId }).then((r) => r.Items);
  }

  resume(limit = 20) {
    return this.get<{ Items: Item[] }>('/UserItems/Resume', {
      userId: this.userId, limit, mediaTypes: 'Video', fields: Jellyfin.FIELDS, enableImageTypes: 'Primary,Backdrop,Thumb,Logo',
    }).then((r) => r.Items);
  }

  nextUp(limit = 20, seriesId?: string) {
    return this.get<{ Items: Item[] }>('/Shows/NextUp', {
      userId: this.userId, limit, seriesId, fields: Jellyfin.FIELDS, enableResumable: true, disableFirstEpisode: false,
    }).then((r) => r.Items);
  }

  latest(parentId: string, limit = 24) {
    return this.get<Item[]>('/Items/Latest', { userId: this.userId, parentId, limit, fields: Jellyfin.FIELDS, groupItems: true });
  }

  items(query: Record<string, unknown>) {
    return this.get<{ Items: Item[]; TotalRecordCount: number }>('/Items', {
      userId: this.userId, recursive: true, fields: Jellyfin.FIELDS, enableTotalRecordCount: true, ...query,
    });
  }

  item(id: string) {
    return this.get<Item>(`/Items/${id}`, { userId: this.userId });
  }

  seasons(seriesId: string) {
    return this.get<{ Items: Item[] }>(`/Shows/${seriesId}/Seasons`, { userId: this.userId, fields: ['ChildCount'] }).then((r) => r.Items);
  }

  episodes(seriesId: string, seasonId?: string, extra: Record<string, unknown> = {}) {
    return this.get<{ Items: Item[] }>(`/Shows/${seriesId}/Episodes`, {
      userId: this.userId, seasonId, fields: ['Overview', 'PrimaryImageAspectRatio'], ...extra,
    }).then((r) => r.Items);
  }

  similar(id: string, limit = 12) {
    return this.get<{ Items: Item[] }>(`/Items/${id}/Similar`, { userId: this.userId, limit, fields: Jellyfin.FIELDS }).then((r) => r.Items);
  }

  genres(parentId?: string) {
    return this.get<{ Items: { Name: string; Id: string }[] }>('/Genres', { userId: this.userId, parentId, sortBy: 'SortName' }).then((r) => r.Items);
  }

  setFavorite(id: string, on: boolean) {
    return this.request<UserData>(on ? 'POST' : 'DELETE', `/UserFavoriteItems/${id}`, { query: { userId: this.userId } });
  }

  setPlayed(id: string, on: boolean) {
    return this.request<UserData>(on ? 'POST' : 'DELETE', `/UserPlayedItems/${id}`, { query: { userId: this.userId } });
  }

  /** Retire un titre de « Reprendre » : la position de lecture est remise à zéro. */
  clearResume(id: string) {
    return this.post(`/UserItems/${id}/UserData`, { PlaybackPositionTicks: 0 }, { userId: this.userId });
  }

  segments(id: string) {
    return this.get<{ Items: { Type: string; StartTicks: number; EndTicks: number }[] }>(`/MediaSegments/${id}`)
      .then((r) => r.Items)
      .catch(() => []);
  }

  // ---------- Lecture ----------

  playbackInfo(id: string, body: Record<string, unknown>) {
    return this.post<{ MediaSources: MediaSource[]; PlaySessionId: string; ErrorCode?: string }>(`/Items/${id}/PlaybackInfo`, { UserId: this.userId, ...body }, { userId: this.userId });
  }

  report(kind: 'start' | 'progress' | 'stopped', info: Record<string, unknown>) {
    const path = kind === 'start' ? '/Sessions/Playing' : kind === 'progress' ? '/Sessions/Playing/Progress' : '/Sessions/Playing/Stopped';
    return this.request('POST', path, { body: info, keepalive: kind === 'stopped' }).catch(() => {});
  }

  /** Adresse d'un fichier vidéo lu tel quel (sans conversion). */
  directUrl(id: string, source: MediaSource, playSessionId: string) {
    const q = new URLSearchParams({ static: 'true', mediaSourceId: source.Id, deviceId: DEVICE_ID, ApiKey: this.token, playSessionId });
    if (source.ETag) q.set('Tag', source.ETag);
    return `${JF}/Videos/${id}/stream.${(source.Container ?? 'mp4').split(',')[0]}?${q}`;
  }
}

export const jf = new Jellyfin();

/**
 * Appli : trouve le serveur Jellyfin à partir de ce que l'utilisateur a tapé
 * (« jellyfin.exemple.fr », « 192.168.1.10:8096 », adresse complète…).
 */
export async function findServer(input: string): Promise<{ url: string; name: string; version: string }> {
  let raw = input.trim().replace(/\/+$/, '').replace(/\/web(\/.*)?$/i, '');
  if (!raw) throw new Error('Saisissez l’adresse du serveur');
  const candidates = /^https?:\/\//i.test(raw)
    ? [raw]
    : /:\d+$|^\d{1,3}(\.\d{1,3}){3}/.test(raw)
      ? [`http://${raw}`, `https://${raw}`, ...(/:\d+$/.test(raw) ? [] : [`http://${raw}:8096`])]
      : [`https://${raw}`, `http://${raw}`, `http://${raw}:8096`];
  let lastError = '';
  for (const url of candidates) {
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => ctrl?.abort(), 6000);
      const res = await fetch(`${url}/System/Info/Public`, { signal: ctrl?.signal });
      clearTimeout(timer);
      if (!res.ok) {
        lastError = `Erreur ${res.status}`;
        continue;
      }
      const info = await res.json();
      if (!info?.Id) continue;
      return { url, name: info.ServerName ?? url, version: info.Version ?? '' };
    } catch (err) {
      lastError = (err as Error).name === 'AbortError' ? 'Pas de réponse' : 'Serveur injoignable';
    }
  }
  throw new Error(`Aucun serveur Jellyfin à cette adresse (${lastError || 'introuvable'}).`);
}

// ---------- Images ----------

type ImgOpts = { w?: number; h?: number; q?: number };
const imgQuery = ({ w, h, q = 90 }: ImgOpts, tag?: string) =>
  new URLSearchParams({ ...(w ? { fillWidth: String(w) } : {}), ...(h ? { fillHeight: String(h) } : {}), quality: String(q), ...(tag ? { tag } : {}) }).toString();

export const image = (id: string, type: string, opts: ImgOpts = {}, tag?: string, index?: number) =>
  `${JF}/Items/${id}/Images/${type}${index !== undefined ? `/${index}` : ''}?${imgQuery(opts, tag)}`;

/** Grande image de fond (film, série ou série parente d'un épisode). */
export function backdropOf(it: Item, w = 1920) {
  if (it.BackdropImageTags?.length) return image(it.Id, 'Backdrop', { w }, it.BackdropImageTags[0], 0);
  if (it.ParentBackdropItemId && it.ParentBackdropImageTags?.length) return image(it.ParentBackdropItemId, 'Backdrop', { w }, it.ParentBackdropImageTags[0], 0);
  return null;
}

/** Logo du titre (texte détouré), ou rien. */
export function logoOf(it: Item, w = 800) {
  if (it.ImageTags?.Logo) return image(it.Id, 'Logo', { w, q: 100 }, it.ImageTags.Logo);
  if (it.ParentLogoItemId && it.ParentLogoImageTag) return image(it.ParentLogoItemId, 'Logo', { w, q: 100 }, it.ParentLogoImageTag);
  return null;
}

/** Affiche verticale (2:3). */
export function posterOf(it: Item, w = 360) {
  if (it.Type === 'Episode' && it.SeriesId && it.SeriesPrimaryImageTag) return image(it.SeriesId, 'Primary', { w }, it.SeriesPrimaryImageTag);
  if (it.ImageTags?.Primary) return image(it.Id, 'Primary', { w }, it.ImageTags.Primary);
  return null;
}

/** Vignette horizontale (16:9) : image d'épisode, miniature ou fond. */
export function thumbOf(it: Item, w = 640) {
  if (it.Type === 'Episode' && it.ImageTags?.Primary) return image(it.Id, 'Primary', { w }, it.ImageTags.Primary);
  if (it.ImageTags?.Thumb) return image(it.Id, 'Thumb', { w }, it.ImageTags.Thumb);
  if (it.ParentThumbItemId && it.ParentThumbImageTag) return image(it.ParentThumbItemId, 'Thumb', { w }, it.ParentThumbImageTag);
  return backdropOf(it, w) ?? (it.ImageTags?.Primary ? image(it.Id, 'Primary', { w }, it.ImageTags.Primary) : null);
}

export const personImage = (p: Person, w = 240) => (p.PrimaryImageTag ? image(p.Id, 'Primary', { w }, p.PrimaryImageTag) : null);
export const userImage = (a: Account) => (a.imageTag ? `${(STANDALONE && a.server) || JF}/Users/${a.userId}/Images/Primary?quality=90&fillWidth=240&tag=${a.imageTag}` : null);
