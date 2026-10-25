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
  if (it.Type === 'BoxSet') return collectionNext(await collectionItems(it.Id));
  if (it.Type === 'Season' && it.SeriesId) {
    const [first] = await jf.episodes(it.SeriesId, it.Id, { limit: 1 });
    return first ?? null;
  }
  return it;
}

/** Les films d'une collection, dans l'ordre de sortie. */
export function collectionItems(id: string) {
  return jf
    .items({ parentId: id, recursive: false, sortBy: 'ProductionYear,PremiereDate,SortName', sortOrder: 'Ascending' })
    .then((r) => r.Items);
}

/** Ce que lance « Lecture » sur une collection : le film commencé, sinon le premier pas encore vu, sinon le premier. */
export async function collectionNext(films: Item[]): Promise<Item | null> {
  const f =
    films.find((x) => (x.UserData?.PlaybackPositionTicks ?? 0) > 0) ?? films.find((x) => !x.UserData?.Played) ?? films[0];
  return f ? playTarget(f) : null;
}

export async function play(it: Item, fromStart = false) {
  const target = await playTarget(it);
  if (target) router.go(links.play(target.Id, fromStart));
}
