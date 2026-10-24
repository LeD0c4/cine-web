<script lang="ts">
  import { mdiArrowLeft, mdiCellphoneLink, mdiServerNetwork } from '@mdi/js';
  import { jf, findServer, setServer, STANDALONE } from '../lib/jellyfin';
  import { session, serverStore } from '../lib/session.svelte';
  import { TV } from '../lib/tv';
  import Brand from '../components/Brand.svelte';
  import Icon from '../components/Icon.svelte';

  // Connexion d'un profil Jellyfin : identifiant + mot de passe, ou code « Quick Connect »
  // à valider depuis un téléphone déjà connecté (pratique à la télé).

  let username = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);
  let server = $state('');
  let qcEnabled = $state(false);
  let qc = $state<{ Code: string; Secret: string } | null>(null);

  // Appli : on choisit d'abord le serveur Jellyfin (gardé pour la prochaine fois).
  let serverUrl = $state(serverStore.get());
  let serverInput = $state(STANDALONE ? (serverStore.get() ?? '') : '');
  let searching = $state(false);

  async function chooseServer(e: SubmitEvent) {
    e.preventDefault();
    if (searching) return;
    searching = true;
    error = '';
    try {
      const found = await findServer(serverInput);
      serverStore.set(found.url);
      serverUrl = found.url;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      searching = false;
    }
  }

  $effect(() => {
    if (!serverUrl) return;
    setServer(serverUrl);
    server = '';
    jf.serverInfo().then((s) => (server = s.ServerName)).catch(() => (error = 'Serveur Jellyfin injoignable'));
    jf.quickConnectEnabled().then((on) => (qcEnabled = on));
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!username || busy) return;
    busy = true;
    error = '';
    try {
      session.add(await jf.login(username.trim(), password));
    } catch (err) {
      const status = (err as { status?: number }).status;
      error = status === 401 ? 'Identifiant ou mot de passe incorrect' : (err as Error).message;
    } finally {
      busy = false;
    }
  }

  // Quick Connect : le code s'affiche, on le valide dans Jellyfin (profil › Quick Connect).
  $effect(() => {
    if (!qc) return;
    const secret = qc.Secret;
    const t = setInterval(async () => {
      try {
        const acc = await jf.quickConnectPoll(secret);
        if (acc) {
          clearInterval(t);
          session.add(acc);
        }
      } catch {
        /* code expiré : on laisse l'utilisateur relancer */
      }
    }, 2500);
    return () => clearInterval(t);
  });

  async function startQc() {
    error = '';
    try {
      qc = await jf.quickConnectStart();
    } catch (err) {
      error = (err as Error).message;
    }
  }
</script>

<div class="login">
  <div class="bg"></div>
  <header><Brand size={1.1} /></header>

  <div class="card fade-in">
    {#if session.adding && session.accounts.length}
      <button class="back" onclick={() => (session.adding = false)} aria-label="Retour"><Icon path={mdiArrowLeft} size={1.3} /></button>
    {/if}

    {#if !serverUrl}
      <h1>Votre serveur</h1>
      <p class="muted">Adresse de votre serveur Jellyfin, par exemple <b>jellyfin.exemple.fr</b> ou <b>192.168.1.20:8096</b>.</p>
      <form onsubmit={chooseServer}>
        <label class="srv">
          <Icon path={mdiServerNetwork} size={1.3} />
          <!-- svelte-ignore a11y_autofocus -->
          <input class="input" bind:value={serverInput} placeholder="Adresse du serveur" autocomplete="url" autocapitalize="none" spellcheck="false" inputmode="url" autofocus={!TV} data-autofocus />
        </label>
        {#if error}<p class="err">{error}</p>{/if}
        <button class="btn gold wide" type="submit" disabled={!serverInput.trim() || searching}>{searching ? 'Recherche…' : 'Continuer'}</button>
      </form>
    {:else if qc}
      <h1>Connexion rapide</h1>
      <p class="muted">Sur un téléphone ou un ordinateur déjà connecté à Jellyfin, ouvrez <b>Profil › Quick Connect</b> et saisissez ce code :</p>
      <div class="code">{qc.Code}</div>
      <p class="muted small"><span class="dot"></span> En attente de validation…</p>
      <button class="btn glass wide" onclick={() => (qc = null)} data-autofocus>Utiliser un mot de passe</button>
    {:else}
      <h1>Connexion</h1>
      <p class="muted">
        {server ? `Serveur ${server}` : 'Connexion au serveur…'}
        {#if STANDALONE}· <button class="link" onclick={() => { serverUrl = null; error = ''; }}>changer</button>{/if}
      </p>
      <form onsubmit={submit}>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="input" bind:value={username} placeholder="Nom d’utilisateur" autocomplete="username" autocapitalize="none" autofocus={!TV} data-autofocus />
        <input class="input" type="password" bind:value={password} placeholder="Mot de passe" autocomplete="current-password" />
        {#if error}<p class="err">{error}</p>{/if}
        <button class="btn gold wide" type="submit" disabled={!username || busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
      </form>
      {#if qcEnabled}
        <div class="or"><span>ou</span></div>
        <button class="btn glass wide" onclick={startQc}><Icon path={mdiCellphoneLink} size={1.3} /> Se connecter avec un code</button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .login {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 6rem 1rem 3rem;
    position: relative;
  }
  .bg {
    position: fixed;
    inset: 0;
    background:
      radial-gradient(60% 50% at 75% 0%, rgba(253, 122, 16, 0.18), transparent 70%),
      radial-gradient(50% 60% at 0% 100%, rgba(200, 205, 215, 0.07), transparent 70%),
      var(--bg);
  }
  header {
    position: fixed;
    top: 0;
    left: 0;
    padding: 1.4rem var(--pad);
    z-index: 1;
  }
  .card {
    position: relative;
    width: min(27rem, 100%);
    padding: 2.6rem 2.2rem 2.2rem;
    border-radius: 1rem;
    background: rgba(14, 15, 19, 0.82);
    border: 1px solid var(--line);
    box-shadow: 0 2rem 5rem rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(14px);
  }
  .back {
    position: absolute;
    top: 1rem;
    left: 1rem;
    color: var(--text-2);
  }
  h1 {
    font-size: 1.9rem;
    font-weight: 700;
    margin-bottom: 0.4rem;
  }
  .muted {
    color: var(--text-2);
    line-height: 1.5;
  }
  .small {
    font-size: 0.9rem;
  }
  form {
    display: grid;
    gap: 0.9rem;
    margin-top: 1.6rem;
  }
  .wide {
    width: 100%;
    min-height: 3.2rem;
  }
  .btn:disabled {
    opacity: 0.5;
  }
  .srv {
    position: relative;
    display: block;
  }
  .srv :global(svg) {
    position: absolute;
    left: 0.9rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-3);
  }
  .srv .input {
    padding-left: 2.9rem;
  }
  .link {
    color: var(--gold);
    text-decoration: underline;
  }
  .err {
    color: var(--danger);
  }
  .or {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 1.3rem 0;
    color: var(--text-3);
    font-size: 0.9rem;
  }
  .or::before,
  .or::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line);
  }
  .code {
    margin: 1.6rem 0;
    text-align: center;
    font-size: 3rem;
    font-weight: 800;
    letter-spacing: 0.3em;
    padding-left: 0.3em;
    background: var(--gold-grad);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .dot {
    display: inline-block;
    width: 0.55rem;
    height: 0.55rem;
    margin-right: 0.4rem;
    border-radius: 50%;
    background: var(--gold);
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
  .card > .btn {
    margin-top: 1.4rem;
  }
</style>
