<script lang="ts">
  import { session } from './lib/session.svelte';
  import { router } from './lib/router.svelte';
  import { focusWhenReady } from './lib/tv';
  import { startReceiver, stopReceiver } from './lib/receiver';
  import { remote } from './lib/remote.svelte';
  import TopBar from './components/TopBar.svelte';
  import Profiles from './pages/Profiles.svelte';
  import Login from './pages/Login.svelte';
  import Home from './pages/Home.svelte';
  import Library from './pages/Library.svelte';
  import Detail from './pages/Detail.svelte';
  import Search from './pages/Search.svelte';
  import Settings from './pages/Settings.svelte';
  import Admin from './pages/Admin.svelte';
  import Player from './pages/Player.svelte';
  import RemoteBar from './components/RemoteBar.svelte';

  const route = $derived(router.route);

  // Appareil pilotable depuis « Lire sur… » des autres appareils, tant qu'un profil est ouvert.
  $effect(() => {
    if (session.current) {
      startReceiver();
      remote.watch();
    } else stopReceiver();
  });

  // Remonte en haut de page à chaque changement d'écran.
  $effect(() => {
    void route.name;
    void (route as { id?: string }).id;
    void session.current;
    window.scrollTo({ top: 0 });
    focusWhenReady();
  });
</script>

{#if session.adding || (!session.current && !session.accounts.length)}
  <Login />
{:else if !session.current}
  <Profiles />
{:else if route.name === 'play'}
  {#key route.id}<Player id={route.id} start={route.t} />{/key}
{:else}
  <TopBar />
  <main>
    {#key router.tick}
    {#if route.name === 'home'}
      <Home />
    {:else if route.name === 'movies'}
      {#key 'movies'}<Library kind="Movie" />{/key}
    {:else if route.name === 'series'}
      {#key 'series'}<Library kind="Series" />{/key}
    {:else if route.name === 'list'}
      {#key 'list'}<Library kind="Favorites" />{/key}
    {:else if route.name === 'settings'}
      <Settings />
    {:else if route.name === 'admin' && session.isAdmin}
      <Admin />
    {:else if route.name === 'search'}
      <Search q={route.q} />
    {:else if route.name === 'item'}
      {#key route.id}<Detail id={route.id} />{/key}
    {/if}
    {/key}
  </main>
  <RemoteBar />
{/if}
