<script lang="ts">
  import { mdiSkipNext, mdiDebugStepOver, mdiAccountSwitchOutline, mdiLogout, mdiAccountPlusOutline, mdiServerNetwork, mdiInformationOutline, mdiUpdate } from '@mdi/js';
  import { prefs, UP_NEXT_DELAYS } from '../lib/prefs.svelte';
  import { session } from '../lib/session.svelte';
  import { JF, STANDALONE } from '../lib/jellyfin';
  import { native } from '../lib/tv';
  import Icon from '../components/Icon.svelte';

  const me = $derived(session.current!);
  const server = $derived(me?.serverName || (STANDALONE ? JF.replace(/^https?:\/\//, '') : location.host));
  const appVersion = (() => {
    try {
      return native?.version?.() ?? '';
    } catch {
      return '';
    }
  })();
  // Appli Android : mises à jour automatiques (recherche aussi à la demande).
  const canUpdate = (() => {
    try {
      return Boolean(native?.checkUpdate && native.canUpdate?.());
    } catch {
      return false;
    }
  })();
</script>

<div class="settings fade-in">
  <h1>Réglages</h1>

  <section>
    <h2><Icon path={mdiSkipNext} size={1.3} /> Épisode suivant</h2>
    <p class="hint">Pendant le générique, une carte propose l’épisode suivant. La vidéo se réduit à gauche et l’épisode suivant se lance tout seul après ce délai, sauf si vous choisissez « Annuler » ou mettez en pause.</p>
    <div class="choices" role="radiogroup" aria-label="Délai avant l’épisode suivant">
      {#each UP_NEXT_DELAYS as d, i (d)}
        <button
          class="opt"
          class:on={prefs.value.upNextDelay === d}
          role="radio"
          aria-checked={prefs.value.upNextDelay === d}
          onclick={() => prefs.set({ upNextDelay: d })}
          data-autofocus={i === 0 ? '' : undefined}
        >{d === 0 ? 'Jamais' : `${d} s`}</button>
      {/each}
    </div>
    {#if prefs.value.upNextDelay === 0}<p class="hint small">L’épisode suivant attendra un appui sur « Continuer ».</p>{/if}
  </section>

  <section>
    <h2><Icon path={mdiDebugStepOver} size={1.3} /> Intro et récapitulatif</h2>
    <button class="toggle" role="switch" aria-checked={prefs.value.autoSkipIntro} onclick={() => prefs.set({ autoSkipIntro: !prefs.value.autoSkipIntro })}>
      <span class="tl">
        <b>Passer automatiquement</b>
        <span class="hint">Saute le générique de début et le « précédemment » quand le serveur les a repérés.</span>
      </span>
      <span class="sw" class:on={prefs.value.autoSkipIntro}><i></i></span>
    </button>
  </section>

  <section>
    <h2><Icon path={mdiServerNetwork} size={1.3} /> Compte</h2>
    <div class="who">
      <b>{me.name}</b>
      <span class="hint">{server}</span>
    </div>
    <div class="actions">
      <button class="btn glass" onclick={() => session.switch()}><Icon path={mdiAccountSwitchOutline} size={1.2} /> Changer de profil</button>
      <button class="btn glass" onclick={() => (session.adding = true)}><Icon path={mdiAccountPlusOutline} size={1.2} /> {STANDALONE ? 'Ajouter un profil ou un serveur' : 'Ajouter un profil'}</button>
      <button class="btn glass" onclick={() => session.forget(me)}><Icon path={mdiLogout} size={1.2} /> Se déconnecter</button>
    </div>
  </section>

  <section>
    <h2><Icon path={mdiInformationOutline} size={1.3} /> À propos</h2>
    <p class="hint">Selvania Ciné {__APP_VERSION__}{appVersion ? ` · appli ${appVersion}` : ''} — pour les serveurs Jellyfin.</p>
    {#if canUpdate}
      <div class="actions">
        <button class="btn glass" onclick={() => native!.checkUpdate!()}><Icon path={mdiUpdate} size={1.2} /> Rechercher une mise à jour</button>
      </div>
      <p class="hint small">L’appli vérifie aussi toute seule au démarrage.</p>
    {/if}
  </section>
</div>

<style>
  .settings {
    max-width: 52rem;
    padding: 6.5rem var(--pad) 4rem;
    min-height: 100vh;
  }
  h1 {
    font-size: 2rem;
    margin: 0 0 1.5rem;
  }
  section {
    display: grid;
    gap: 0.8rem;
    padding: 1.4rem 0;
    border-top: 1px solid var(--line);
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 1.2rem;
    margin: 0;
  }
  h2 :global(svg) {
    color: var(--gold);
  }
  .hint {
    color: var(--text-2);
    font-size: 0.95rem;
    line-height: 1.45;
    margin: 0;
  }
  .small {
    font-size: 0.88rem;
    color: var(--text-3);
  }
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .opt {
    min-width: 4.6rem;
    height: 2.8rem;
    padding: 0 1rem;
    border-radius: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.05);
    font-weight: 600;
    color: var(--text-2);
    transition: background 0.15s ease, color 0.15s ease;
  }
  .opt:hover {
    color: var(--text);
  }
  .opt.on {
    color: #1b1104;
    border-color: transparent;
    background: var(--gold-grad);
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.9rem 1rem;
    border-radius: var(--radius);
    background: rgba(255, 255, 255, 0.04);
    text-align: left;
  }
  .tl {
    flex: 1;
    display: grid;
    gap: 0.2rem;
  }
  .sw {
    flex: none;
    position: relative;
    width: 3.2rem;
    height: 1.8rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.2);
    transition: background 0.2s ease;
  }
  .sw i {
    position: absolute;
    top: 0.2rem;
    left: 0.2rem;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.2s ease;
  }
  .sw.on {
    background: var(--gold);
  }
  .sw.on i {
    transform: translateX(1.4rem);
  }
  .who {
    display: grid;
    gap: 0.15rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  @media (max-width: 700px) {
    .actions .btn {
      width: 100%;
      justify-content: flex-start;
    }
  }
</style>
