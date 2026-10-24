// Réglages de lecture de cet appareil (navigateur, appli Android, télé LG), gardés sur l'appareil.

export type Prefs = {
  /** Secondes avant de lancer l'épisode suivant pendant le générique ; 0 = jamais automatiquement. */
  upNextDelay: number;
  /** Saute l'intro et le récapitulatif sans attendre l'appui sur le bouton. */
  autoSkipIntro: boolean;
};

export const UP_NEXT_DELAYS = [0, 3, 5, 10, 15, 30];

const KEY = 'cine.prefs';
const DEFAULTS: Prefs = { upNextDelay: 5, autoSkipIntro: false };

function read(): Prefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return { ...DEFAULTS };
  }
}

class PrefsStore {
  value = $state<Prefs>(read());

  set(patch: Partial<Prefs>) {
    this.value = { ...this.value, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.value));
    } catch {
      /* stockage indisponible : le réglage vaut pour cette visite */
    }
  }
}

export const prefs = new PrefsStore();
