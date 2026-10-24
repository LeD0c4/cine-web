import '@fontsource-variable/inter';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { TV, setupTvNavigation } from './lib/tv';
import { router } from './lib/router.svelte';

if (TV) setupTvNavigation(() => {
  // Retour de la télécommande : d'abord les menus ouverts, puis l'écran précédent.
  const layer = document.querySelector<HTMLElement>('[data-nav-trap]');
  if (layer) layer.dispatchEvent(new CustomEvent('navclose'));
  else router.back();
});

// Appli Android TV : bouton Retour de la télécommande et retour du lecteur natif.
(window as unknown as { __selvaniaBack: () => boolean }).__selvaniaBack = () => {
  const layer = document.querySelector<HTMLElement>('[data-nav-trap]');
  if (layer) {
    layer.dispatchEvent(new CustomEvent('navclose'));
    return true;
  }
  if (router.route.name !== 'home') {
    router.back();
    return true;
  }
  return false;
};
window.addEventListener('selvania:resume', () => router.refresh());

export default mount(App, { target: document.getElementById('app')! });
