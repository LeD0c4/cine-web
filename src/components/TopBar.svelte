<script lang="ts">
  import { mdiMagnify, mdiAccountSwitchOutline, mdiLogout, mdiChevronDown, mdiCogOutline, mdiShieldCrownOutline } from '@mdi/js';
  import { router } from '../lib/router.svelte';
  import { session } from '../lib/session.svelte';
  import { userImage } from '../lib/jellyfin';
  import { trap } from '../lib/tv';
  import Icon from './Icon.svelte';
  import Brand from './Brand.svelte';

  let scrolled = $state(false);
  let menu = $state(false);

  $effect(() => {
    const on = () => (scrolled = window.scrollY > 20);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  });

  const LINKS = [
    { path: '/', label: 'Accueil', name: 'home' },
    { path: '/series', label: 'Séries', name: 'series' },
    { path: '/films', label: 'Films', name: 'movies' },
    { path: '/ma-liste', label: 'Ma liste', name: 'list' },
  ];

  const me = $derived(session.current!);
  const avatar = $derived(me ? userImage(me) : null);
</script>

<header class:scrolled>
  <button class="logo" onclick={() => router.go('/')} aria-label="Accueil"><Brand size={0.95} /></button>
  <nav>
    {#each LINKS as l (l.path)}
      <a href="#{l.path}" class:on={router.route.name === l.name || (l.name === 'movies' && router.route.name === 'collections')} onclick={(e) => { e.preventDefault(); router.go(l.path); }}>{l.label}</a>
    {/each}
  </nav>
  <div class="spacer"></div>
  <button class="icon" class:on={router.route.name === 'search'} onclick={() => router.go('/recherche')} aria-label="Rechercher">
    <Icon path={mdiMagnify} size={1.6} />
  </button>
  <div class="me">
    <button class="profile" onclick={() => (menu = !menu)} aria-label="Profil">
      {#if avatar}<img src={avatar} alt="" />{:else}<span class="initial">{me.name.charAt(0).toUpperCase()}</span>{/if}
      <Icon path={mdiChevronDown} size={1.1} />
    </button>
    {#if menu}
      <div class="backdrop" role="presentation" onclick={() => (menu = false)}></div>
      <div class="menu" role="menu" tabindex="-1" use:trap={() => (menu = false)}>
        <p class="who">{me.name}</p>
        <button onclick={() => { menu = false; router.go('/reglages'); }}><Icon path={mdiCogOutline} size={1.2} /> Réglages</button>
        {#if session.isAdmin}
          <button onclick={() => { menu = false; router.go('/admin'); }}><Icon path={mdiShieldCrownOutline} size={1.2} /> Administration</button>
        {/if}
        <button onclick={() => { menu = false; session.switch(); }}><Icon path={mdiAccountSwitchOutline} size={1.2} /> Changer de profil</button>
        <button onclick={() => { menu = false; session.forget(me); }}><Icon path={mdiLogout} size={1.2} /> Se déconnecter</button>
      </div>
    {/if}
  </div>
</header>

<style>
  header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 2rem;
    height: 4.4rem;
    padding: env(safe-area-inset-top) var(--pad) 0;
    background: linear-gradient(180deg, rgba(8, 9, 12, 0.85) 0%, rgba(8, 9, 12, 0) 100%);
    transition: background 0.35s ease;
  }
  header.scrolled {
    background: rgba(11, 12, 15, 0.96);
    box-shadow: 0 1px 0 var(--line);
  }
  .logo {
    flex: none;
  }
  nav {
    display: flex;
    gap: 1.4rem;
    overflow-x: auto;
    scrollbar-width: none;
  }
  nav a {
    flex: none;
    font-size: 0.98rem;
    color: var(--text-2);
    padding: 0.4rem 0;
    border-bottom: 2px solid transparent;
    transition: color 0.2s ease;
  }
  nav a:hover {
    color: var(--text);
  }
  nav a.on {
    color: var(--text);
    font-weight: 600;
    border-bottom-color: var(--gold);
  }
  .spacer {
    flex: 1;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 50%;
  }
  .icon.on {
    color: var(--gold);
  }
  .me {
    position: relative;
  }
  .profile {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--text-2);
  }
  .profile img,
  .initial {
    width: 2.3rem;
    height: 2.3rem;
    border-radius: 0.35rem;
    object-fit: cover;
  }
  .initial {
    display: grid;
    place-items: center;
    font-weight: 700;
    color: #1b1104;
    background: var(--gold-grad);
  }
  .backdrop {
    position: fixed;
    inset: 0;
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 0.8rem);
    min-width: 14rem;
    display: grid;
    padding: 0.5rem;
    border-radius: 0.6rem;
    background: rgba(20, 22, 27, 0.98);
    border: 1px solid var(--line);
    box-shadow: 0 1rem 2.5rem rgba(0, 0, 0, 0.6);
    animation: fade-in 0.15s ease;
  }
  .who {
    padding: 0.5rem 0.7rem 0.6rem;
    font-weight: 600;
    border-bottom: 1px solid var(--line);
    margin-bottom: 0.3rem;
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.65rem 0.7rem;
    border-radius: 0.4rem;
    text-align: left;
    color: var(--text-2);
  }
  .menu button:hover,
  .menu button:focus {
    background: rgba(255, 255, 255, 0.07);
    color: var(--text);
  }
  @media (max-width: 760px) {
    header {
      gap: 1rem;
      height: 3.8rem;
    }
    .logo :global(.word) {
      display: none;
    }
    nav {
      gap: 1rem;
    }
    nav a {
      font-size: 0.92rem;
    }
  }
</style>
