import { jf, JF, absolute, DEVICE_ID, backdropOf, thumbOf, type Item } from './jellyfin';
import { episodeCode } from './format';
import { prefs } from './prefs.svelte';
import { native } from './tv';

/** Diffusion Chromecast de l'appli Android (pas sur la télé elle-même). */
export const nativeCast = Boolean(native?.cast && native.canCast?.());

/** Ce que le lecteur natif ou la diffusion de l'appli Android reçoivent pour lancer une vidéo. */
export function nativeRequest(it: Item, startTicks: number) {
  const backdrop = backdropOf(it);
  const thumb = thumbOf(it, 640);
  return JSON.stringify({
    server: absolute(JF),
    token: jf.token,
    userId: jf.userId,
    deviceId: DEVICE_ID,
    itemId: it.Id,
    startTicks: Math.round(startTicks),
    title: it.Type === 'Episode' ? it.SeriesName ?? '' : it.Name,
    subtitle: it.Type === 'Episode' ? `${episodeCode(it)} — ${it.Name}` : '',
    backdrop: backdrop ? absolute(backdrop) : null,
    thumb: thumb ? absolute(thumb) : null,
    upNextDelay: prefs.value.upNextDelay,
    autoSkipIntro: prefs.value.autoSkipIntro,
  });
}
