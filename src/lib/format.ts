import { TICKS, type Item, type MediaStream } from './jellyfin';

export function duration(ticks?: number) {
  if (!ticks) return '';
  const min = Math.round(ticks / TICKS / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

export function clock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function remaining(it: Item) {
  const pos = it.UserData?.PlaybackPositionTicks ?? 0;
  if (!it.RunTimeTicks || !pos) return '';
  const min = Math.max(1, Math.round((it.RunTimeTicks - pos) / TICKS / 60));
  return min >= 60 ? `Reste ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `Reste ${min} min`;
}

export function progress(it: Item) {
  const pct = it.UserData?.PlayedPercentage;
  if (pct) return pct;
  const pos = it.UserData?.PlaybackPositionTicks;
  return pos && it.RunTimeTicks ? (pos / it.RunTimeTicks) * 100 : 0;
}

export function years(it: Item) {
  if (it.Type !== 'Series' || !it.ProductionYear) return it.ProductionYear ? String(it.ProductionYear) : '';
  const end = it.EndDate ? new Date(it.EndDate).getFullYear() : null;
  if (it.Status === 'Continuing') return `${it.ProductionYear} –`;
  return end && end !== it.ProductionYear ? `${it.ProductionYear} – ${end}` : String(it.ProductionYear);
}

export const episodeCode = (it: Item) =>
  it.ParentIndexNumber !== undefined && it.IndexNumber !== undefined ? `S${it.ParentIndexNumber} · É${it.IndexNumber}` : '';

/** Titre affiché sous une vignette : série + épisode, ou nom du film. */
export function cardTitle(it: Item) {
  return it.Type === 'Episode' ? it.SeriesName ?? it.Name : it.Name;
}
export function cardSubtitle(it: Item) {
  if (it.Type === 'Episode') return [episodeCode(it), it.Name].filter(Boolean).join(' — ');
  return years(it);
}

/** Qualité de la vidéo (4K, HD…) et HDR. */
export function quality(streams: MediaStream[] = []) {
  const v = streams.find((s) => s.Type === 'Video');
  if (!v?.Width) return [];
  const tags = [v.Width >= 3200 ? '4K' : v.Width >= 1800 ? 'Full HD' : v.Width >= 1200 ? 'HD' : 'SD'];
  if (v.VideoRangeType && v.VideoRangeType !== 'SDR') tags.push(v.VideoRangeType.includes('DOVI') ? 'Dolby Vision' : 'HDR');
  const a = streams.find((s) => s.Type === 'Audio' && s.IsDefault) ?? streams.find((s) => s.Type === 'Audio');
  if (a?.Channels && a.Channels >= 6) tags.push(a.Channels >= 8 ? '7.1' : '5.1');
  return tags;
}

const LANGS: Record<string, string> = {
  fre: 'Français', fra: 'Français', fr: 'Français', eng: 'Anglais', en: 'Anglais', spa: 'Espagnol', ger: 'Allemand', deu: 'Allemand',
  ita: 'Italien', jpn: 'Japonais', kor: 'Coréen', por: 'Portugais', rus: 'Russe', chi: 'Chinois', zho: 'Chinois', dut: 'Néerlandais', nld: 'Néerlandais',
  ara: 'Arabe', hin: 'Hindi', swe: 'Suédois', nor: 'Norvégien', dan: 'Danois', fin: 'Finnois', pol: 'Polonais', tur: 'Turc', und: 'Inconnue',
};
export const langName = (code?: string) => (code ? LANGS[code.toLowerCase()] ?? code.toUpperCase() : '');

/** Nom lisible d'une piste audio ou de sous-titres. */
export function trackLabel(s: MediaStream) {
  const lang = langName(s.Language);
  const extra: string[] = [];
  if (s.Type === 'Audio') {
    if (s.Codec) extra.push(s.Codec.toUpperCase().replace('EAC3', 'Dolby Digital+').replace('AC3', 'Dolby Digital').replace('TRUEHD', 'TrueHD'));
    if (s.Channels) extra.push(s.Channels >= 8 ? '7.1' : s.Channels >= 6 ? '5.1' : s.Channels === 2 ? 'Stéréo' : `${s.Channels} canaux`);
  } else {
    if (s.IsForced) extra.push('forcés');
    if (s.Title && !/^(sdh|full|forced)$/i.test(s.Title) && s.Title.length < 30) extra.push(s.Title);
    else if (/sdh/i.test(s.Title ?? '')) extra.push('malentendants');
  }
  const base = lang || s.Title || s.DisplayTitle || `Piste ${s.Index}`;
  return extra.length ? `${base} · ${extra.join(' · ')}` : base;
}
