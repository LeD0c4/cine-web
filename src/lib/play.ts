import { jf, type Item } from './jellyfin';
import { router, links } from './router.svelte';

/** Ce que « Lecture » lance : le film, ou le prochain épisode à voir d'une série. */
export async function playTarget(it: Item): Promise<Item | null> {
  if (it.Type === 'Series') {
    const [next] = await jf.nextUp(1, it.Id);
    if (next) return next;
    const [first] = await jf.episodes(it.Id, undefined, { limit: 1 });
    return first ?? null;
  }
  if (it.Type === 'Season' && it.SeriesId) {
    const [first] = await jf.episodes(it.SeriesId, it.Id, { limit: 1 });
    return first ?? null;
  }
  return it;
}

export async function play(it: Item, fromStart = false) {
  const target = await playTarget(it);
  if (target) router.go(links.play(target.Id, fromStart));
}
