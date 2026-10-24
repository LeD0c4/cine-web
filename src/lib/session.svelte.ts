import { jf, setServer, STANDALONE, type Account } from './jellyfin';

// Profils de la famille enregistrés sur cet appareil (« Qui regarde ? »).

const ACCOUNTS = 'cine.accounts';
const CURRENT = 'cine.current';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible */
  }
}

/** Appli : serveur Jellyfin choisi au premier lancement (gardé pour les connexions suivantes). */
export const serverStore = {
  get: () => (STANDALONE ? read<string | null>('cine.server', null) : '/jellyfin'),
  set: (url: string) => write('cine.server', url),
};

class Session {
  accounts = $state<Account[]>(read(ACCOUNTS, []));
  current = $state<Account | null>(null);
  /** Compte administrateur du serveur : accès à la page Administration. */
  isAdmin = $state(false);
  /** Ajout d'un profil en cours (écran de connexion par-dessus le choix des profils). */
  adding = $state(false);

  constructor() {
    const id = read<string | null>(CURRENT, null);
    const acc = this.accounts.find((a) => a.userId === id);
    // Un seul profil : on entre directement.
    if (acc) this.use(acc);
    else if (this.accounts.length === 1) this.use(this.accounts[0]);
  }

  use(acc: Account) {
    setServer(acc.server);
    this.current = acc;
    jf.token = acc.token;
    jf.userId = acc.userId;
    write(CURRENT, acc.userId);
    this.isAdmin = false;
    jf.get<{ Policy?: { IsAdministrator?: boolean } }>('/Users/Me')
      .then((u) => {
        if (this.current?.userId === acc.userId) this.isAdmin = Boolean(u.Policy?.IsAdministrator);
      })
      .catch(() => {});
  }

  add(acc: Account) {
    this.accounts = [...this.accounts.filter((a) => !(a.userId === acc.userId && a.server === acc.server)), acc];
    write(ACCOUNTS, this.accounts);
    this.adding = false;
    this.use(acc);
  }

  /** Retour au choix des profils (le profil reste enregistré). */
  switch() {
    this.current = null;
    jf.token = '';
    write(CURRENT, null);
  }

  /** Session refusée par le serveur, ou déconnexion demandée : le profil est retiré. */
  async forget(acc: Account, remote = true) {
    if (remote && this.current?.userId === acc.userId) await jf.logout();
    this.accounts = this.accounts.filter((a) => a.userId !== acc.userId);
    write(ACCOUNTS, this.accounts);
    if (this.current?.userId === acc.userId) this.switch();
  }
}

export const session = new Session();
