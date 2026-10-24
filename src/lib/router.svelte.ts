// Navigation par l'adresse (#/films, #/item/…) : le bouton Retour du navigateur, de la télécommande
// ou du téléphone revient naturellement à l'écran précédent.

export type Route =
  | { name: 'home' }
  | { name: 'movies' }
  | { name: 'series' }
  | { name: 'list' }
  | { name: 'settings' }
  | { name: 'admin' }
  | { name: 'search'; q: string }
  | { name: 'item'; id: string }
  | { name: 'play'; id: string; t: number | null };

function parse(): Route {
  const [path, qs] = location.hash.replace(/^#/, '').split('?');
  const q = new URLSearchParams(qs ?? '');
  const parts = path.split('/').filter(Boolean);
  switch (parts[0]) {
    case 'films':
      return { name: 'movies' };
    case 'series':
      return { name: 'series' };
    case 'ma-liste':
      return { name: 'list' };
    case 'reglages':
      return { name: 'settings' };
    case 'admin':
      return { name: 'admin' };
    case 'recherche':
      return { name: 'search', q: q.get('q') ?? '' };
    case 'titre':
      return parts[1] ? { name: 'item', id: parts[1] } : { name: 'home' };
    case 'lecture':
      return parts[1] ? { name: 'play', id: parts[1], t: q.has('t') ? Number(q.get('t')) : null } : { name: 'home' };
    default:
      return { name: 'home' };
  }
}

class Router {
  route = $state<Route>(parse());
  /** Change pour recharger l'écran courant (retour du lecteur natif). */
  tick = $state(0);

  refresh() {
    this.tick++;
  }

  constructor() {
    window.addEventListener('hashchange', () => (this.route = parse()));
  }

  go(path: string, replace = false) {
    const hash = `#${path}`;
    if (replace) history.replaceState(null, '', hash);
    else if (location.hash !== hash) history.pushState(null, '', hash);
    this.route = parse();
  }

  back() {
    if (history.length > 1 && location.hash && location.hash !== '#/') history.back();
    else this.go('/', true);
  }
}

export const router = new Router();

export const links = {
  item: (id: string) => `/titre/${id}`,
  play: (id: string, fromStart = false) => `/lecture/${id}${fromStart ? '?t=0' : ''}`,
};
