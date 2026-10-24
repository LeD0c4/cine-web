// Télé (Android TV) : navigation à la télécommande, avec les flèches.
// L'appli Selvania TV ajoute « SelvaniaTV » à l'identifiant du navigateur ; ?tv=1 force le mode pour tester.

export const XBOX = /Xbox/i.test(navigator.userAgent);

function detect() {
  if (/SelvaniaTV|Web0S|webOS/.test(navigator.userAgent) || XBOX) return true;
  try {
    const q = new URLSearchParams(location.search).get('tv');
    if (q !== null) sessionStorage.setItem('cine.tv', q === '0' ? '0' : '1');
    return sessionStorage.getItem('cine.tv') === '1';
  } catch {
    return false;
  }
}

export const TV = detect();

/**
 * Appli Android : lecteur natif (ExoPlayer, lit tous les formats sans conversion) et diffusion
 * Chromecast intégrée (kit Google Cast) sur téléphone.
 */
export type NativeBridge = {
  play(json: string): void;
  version?(): string;
  canCast?(): boolean;
  cast?(json: string): void;
  /** Mises à jour automatiques de l'appli (dépôt de releases) : recherche à la demande. */
  canUpdate?(): boolean;
  checkUpdate?(): void;
};
export const native = (window as unknown as { SelvaniaTV?: NativeBridge }).SelvaniaTV ?? null;

const FOCUSABLE = 'button:not([disabled]), a[href], input, select, [data-focus]';

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const st = getComputedStyle(el);
  return st.visibility !== 'hidden' && st.display !== 'none' && !el.closest('[inert], [aria-hidden="true"]');
}

/** Élément à l'intérieur d'une zone modale ouverte (menu du lecteur…), sinon toute la page. */
function scope(): ParentNode {
  const layers = document.querySelectorAll<HTMLElement>('[data-nav-trap]');
  return layers.length ? layers[layers.length - 1] : document;
}

type Dir = 'left' | 'right' | 'up' | 'down';

function next(from: HTMLElement, dir: Dir) {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of scope().querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (el === from || !visible(el)) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    let main: number;
    let cross: number;
    switch (dir) {
      case 'right':
        main = b.left - a.right + a.width * 0.1;
        cross = Math.abs(by - ay);
        if (bx <= ax + 1) continue;
        break;
      case 'left':
        main = a.left - b.right + a.width * 0.1;
        cross = Math.abs(by - ay);
        if (bx >= ax - 1) continue;
        break;
      case 'down':
        main = b.top - a.bottom + a.height * 0.1;
        cross = Math.abs(bx - ax);
        if (by <= ay + 1) continue;
        break;
      default:
        main = a.top - b.bottom + a.height * 0.1;
        cross = Math.abs(bx - ax);
        if (by >= ay - 1) continue;
    }
    // Les éléments alignés sur l'axe passent avant les éléments en diagonale.
    const score = Math.max(0, main) + cross * (dir === 'left' || dir === 'right' ? 3 : 0.6);
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

/** Focus de départ : l'élément principal de l'écran (bouton Lecture…), sinon le premier. */
export function focusFirst(root: ParentNode = document) {
  const el =
    [...root.querySelectorAll<HTMLElement>('[data-autofocus]')].find(visible) ??
    [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].find(visible);
  el?.focus({ preventScroll: false });
}

/** Nouvel écran : on place le focus dès que son contenu est affiché. */
export function focusWhenReady() {
  if (!TV) return;
  (document.activeElement as HTMLElement | null)?.blur?.();
  let tries = 0;
  const t = setInterval(() => {
    const active = document.activeElement;
    if ((active && active !== document.body) || ++tries > 30) return clearInterval(t);
    if (document.querySelector('[data-autofocus]')) {
      focusFirst(scope());
      clearInterval(t);
    }
  }, 150);
}

/**
 * Zone « piège » (menu, fenêtre) : les flèches restent dedans et Retour la ferme.
 * À la télé, le premier élément reçoit le focus à l'ouverture.
 */
export function trap(node: HTMLElement, close: () => void) {
  let onClose = close;
  const before = document.activeElement as HTMLElement | null;
  node.setAttribute('data-nav-trap', '');
  const handler = () => onClose();
  node.addEventListener('navclose', handler);
  if (TV) queueMicrotask(() => focusFirst(node));
  return {
    update(c: () => void) {
      onClose = c;
    },
    destroy() {
      node.removeEventListener('navclose', handler);
      if (TV && before?.isConnected) before.focus({ preventScroll: true });
    },
  };
}

export function setupTvNavigation(onBack: () => void) {
  document.documentElement.classList.add('tv');
  // Edge sur Xbox : la manette envoie des touches (croix = flèches, A = Entrée, B = retour)
  // au lieu de piloter un pointeur de souris.
  if (XBOX) {
    try {
      (navigator as Navigator & { gamepadInputEmulation?: string }).gamepadInputEmulation = 'keyboard';
    } catch {
      /* navigateur sans cette option */
    }
  }
  window.addEventListener('keydown', (e) => {
    const dirs: Record<string, Dir> = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      GamepadDPadLeft: 'left', GamepadDPadRight: 'right', GamepadDPadUp: 'up', GamepadDPadDown: 'down',
      GamepadLeftThumbstickLeft: 'left', GamepadLeftThumbstickRight: 'right', GamepadLeftThumbstickUp: 'up', GamepadLeftThumbstickDown: 'down',
    };
    const dir = dirs[e.key];
    const active = document.activeElement as HTMLElement | null;
    if (e.defaultPrevented) return;

    if (e.key === 'GamepadA' && active && active !== document.body) {
      e.preventDefault();
      active.click();
      return;
    }
    // Télécommande LG : le bouton Retour envoie le code 461.
    if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack' || e.key === 'BrowserBack' || e.key === 'GamepadB' || e.keyCode === 461) {
      if (active?.tagName === 'INPUT' && e.key === 'Backspace') return;
      e.preventDefault();
      onBack();
      return;
    }
    if (!dir) return;
    if (active?.tagName === 'INPUT' && (dir === 'left' || dir === 'right')) return;
    if (active?.closest('[data-nav-self]')) return; // le composant gère ses flèches (barre de lecture…)

    e.preventDefault();
    if (!active || active === document.body || !visible(active)) {
      focusFirst(scope());
      return;
    }
    const target = next(active, dir);
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      // Ligne de vignettes : garde un peu de marge à gauche, comme Netflix.
      const row = target.closest<HTMLElement>('[data-row]');
      if (row && dir !== 'up' && dir !== 'down') {
        const r = target.getBoundingClientRect();
        const box = row.getBoundingClientRect();
        if (r.left < box.left + 40 || r.right > box.right - 40) row.scrollBy({ left: r.left - box.left - 60, behavior: 'smooth' });
      }
      if (dir === 'up' || dir === 'down') {
        const r = target.getBoundingClientRect();
        if (r.top < 120 || r.bottom > innerHeight - 40) window.scrollBy({ top: r.top - innerHeight * 0.35, behavior: 'smooth' });
      }
    }
  });
}
