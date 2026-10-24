<script lang="ts">
  import { mdiPlus, mdiPencilOutline, mdiClose } from '@mdi/js';
  import { session } from '../lib/session.svelte';
  import { userImage } from '../lib/jellyfin';
  import Brand from '../components/Brand.svelte';
  import Icon from '../components/Icon.svelte';

  // « Qui regarde ? » : chaque membre de la famille garde sa progression et sa liste.
  let manage = $state(false);
</script>

<div class="profiles fade-in">
  <header><Brand size={1.1} /></header>
  <h1>Qui regarde ?</h1>
  <div class="list">
    {#each session.accounts as a, i (a.userId)}
      {@const img = userImage(a)}
      <button class="p" onclick={() => (manage ? session.forget(a) : session.use(a))} data-autofocus={i === 0 ? '' : undefined}>
        <span class="avatar" style:--h={(i * 67) % 360}>
          {#if img}<img src={img} alt="" />{:else}<span class="letter">{a.name.charAt(0).toUpperCase()}</span>{/if}
          {#if manage}<span class="del"><Icon path={mdiClose} size={2} /></span>{/if}
        </span>
        <span class="name">{a.name}</span>
      </button>
    {/each}
    <button class="p add" onclick={() => (session.adding = true)}>
      <span class="avatar"><Icon path={mdiPlus} size={3} /></span>
      <span class="name">Ajouter</span>
    </button>
  </div>
  <button class="manage" class:on={manage} onclick={() => (manage = !manage)}>
    <Icon path={mdiPencilOutline} size={1.1} /> {manage ? 'Terminé' : 'Gérer les profils'}
  </button>
</div>

<style>
  .profiles {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2.4rem;
    padding: 6rem 1rem 3rem;
    background: radial-gradient(70% 50% at 50% 0%, rgba(253, 122, 16, 0.12), transparent 70%), var(--bg);
  }
  header {
    position: fixed;
    top: 0;
    left: 0;
    padding: 1.4rem var(--pad);
  }
  h1 {
    font-size: 2.8rem;
    font-size: clamp(2rem, 4vw, 3.2rem);
    font-weight: 600;
  }
  .list {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 2rem;
  }
  .p {
    display: grid;
    justify-items: center;
    gap: 0.9rem;
    color: var(--text-3);
    transition: color 0.2s ease;
  }
  .avatar {
    position: relative;
    display: grid;
    place-items: center;
    width: clamp(6.5rem, 11vw, 9.5rem);
    aspect-ratio: 1;
    border-radius: 0.5rem;
    overflow: hidden;
    background: linear-gradient(140deg, hsl(calc(28 + var(--h, 0) * 0.08) 90% 58%), hsl(calc(18 + var(--h, 0) * 0.05) 85% 38%));
    border: 3px solid transparent;
    transition: border-color 0.2s ease, transform 0.2s ease;
  }
  @supports not (aspect-ratio: 1 / 1) {
    .avatar {
      width: 8rem;
      height: 8rem;
    }
  }
  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .letter {
    font-size: 3.4rem;
    font-weight: 800;
    color: rgba(20, 12, 4, 0.85);
  }
  .add .avatar {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-3);
  }
  .del {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
  }
  .p:hover,
  .p:focus {
    color: var(--text);
    outline: none;
  }
  .p:hover .avatar,
  .p:focus .avatar {
    border-color: var(--gold);
    transform: scale(1.04);
  }
  .name {
    font-size: 1.15rem;
  }
  .manage {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.7rem 1.4rem;
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: var(--text-3);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 0.85rem;
  }
  .manage:hover,
  .manage.on {
    color: var(--text);
    border-color: var(--text);
  }
</style>
