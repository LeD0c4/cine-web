# Selvania Ciné — interface web

Un client **Jellyfin** « façon Netflix », sombre et doré : accueil avec grande affiche, rangées *Reprendre* et *À suivre*, profils, lecteur avec saut d'intro et écran de fin d'épisode, diffusion Chromecast, page d'administration du serveur. Interface en français.

> **English** — A Netflix-style web client for Jellyfin (Svelte 5). It runs as a website next to your Jellyfin server and is also embedded in the Android (phone + TV) and LG webOS apps. The UI is in French; contributions to add other languages are welcome.

Ce dépôt contient l'interface. Elle sert à trois choses :

| Usage | Comment |
|---|---|
| **Site** | hébergé à côté de Jellyfin (Docker + nginx) ; nginx relaie l'API sous `/jellyfin`, sans souci de CORS |
| **Appli Android** (téléphone + télé) | dépôt [`cine-android`](https://github.com/LeD0c4/cine-android) : l'interface est intégrée à l'APK |
| **Appli LG webOS** | dépôt [`cine-webos`](https://github.com/LeD0c4/cine-webos) |

Dans les applis, le serveur Jellyfin est choisi au premier lancement : elles fonctionnent avec n'importe quel serveur.

## Fonctions

- **Profils** « Qui regarde ? » : plusieurs comptes et plusieurs serveurs sur le même appareil ; connexion par identifiant ou par **Quick Connect** (code validé depuis un autre appareil).
- **Accueil** : affiche défilante, *Reprendre*, *À suivre*, ajouts récents par médiathèque ; Séries, Films, Ma liste, Recherche ; fiche avec saisons, épisodes, distribution, titres similaires, bande-annonce.
- **Lecteur** : lecture directe quand l'appareil sait lire le fichier, sinon conversion HLS par le serveur ; pistes audio, sous-titres (affichés par l'interface), qualité ; reprise de la lecture.
- **Intro et générique** : « Passer l'intro » (segments repérés par Jellyfin) et **écran de fin** : la vidéo se réduit à gauche et continue, l'épisode suivant s'affiche à droite avec un compte à rebours.
- **Réglages** : délai avant l'épisode suivant (jamais, 3 à 30 s ; 5 s par défaut), saut automatique de l'intro.
- **Lire sur…** : Chromecast (Chrome, ou diffusion intégrée de l'appli Android), autres appareils Jellyfin (Xbox, télé…) avec barre de télécommande et file d'attente.
- **Mode télé** (Android TV, LG, Xbox) : navigation aux flèches de la télécommande ou à la manette.
- **Administration** (comptes administrateurs) : lectures en cours, médiathèques et analyses, utilisateurs, appareils, tâches planifiées, journal, réglages du serveur (Quick Connect, débit maximal à distance, accélération matérielle…), et un **thème assorti pour l'interface web de Jellyfin** (ajouté à son CSS personnalisé sans effacer le reste).

## Démarrer

Prérequis : Node.js 20.19+ (ou 22).

```bash
npm install
npm run dev        # site : http://localhost:5180
npm run dev:app    # version « appli » : demande l'adresse du serveur
npm run check      # vérification TypeScript / Svelte
```

En mode site, `/jellyfin` est relayé vers le serveur indiqué par `JELLYFIN_URL` (par défaut le serveur de démonstration de Jellyfin, compte `demo` sans mot de passe) :

```bash
JELLYFIN_URL=https://jellyfin.exemple.fr npm run dev
```

| Commande | Résultat |
|---|---|
| `npm run build` | site dans `dist/` |
| `npm run build:app` | version « appli » dans `dist-app/` (adresses relatives, compatible avec les vieux moteurs web des télés) — utilisée par `cine-android` et `cine-webos` |
| `npm run pack` | `cine-web.tgz` à installer sur le serveur (voir plus bas) |

### Variables

| Variable | Rôle |
|---|---|
| `JELLYFIN_URL` | (développement) serveur Jellyfin relayé sous `/jellyfin` |
| `VITE_PUBLIC_URL` | (compilation) adresse publique du site, utilisée pour les liens envoyés aux Chromecast quand le site est ouvert par une adresse locale |

## Installer le site sur un serveur

Le site est un conteneur nginx qui sert l'interface et relaie `/jellyfin` vers le conteneur Jellyfin (même réseau Docker).

```bash
npm run pack
scp cine-web.tgz utilisateur@serveur:~
ssh utilisateur@serveur "mkdir -p /tmp/cine && tar -xzf ~/cine-web.tgz -C /tmp/cine && bash /tmp/cine/install-vps.sh"
```

`install-vps.sh` copie le site (en sauvegardant la version précédente), garde votre `.env` et lance `docker compose`. Réglages par variables d'environnement :

| Variable | Défaut |
|---|---|
| `CINE_DIR` | `~/docker/cine-web` |
| `TRAEFIK_RULES` | `~/docker/traefik/rules` |
| `JELLYFIN_RULE` | `$TRAEFIK_RULES/jellyfin.yml` |

À la première installation, réglez dans `.env` le réseau Docker partagé avec Jellyfin et le reverse proxy (`TRAEFIK_NETWORK=…`). Si Jellyfin n'est pas joignable sous le nom `jellyfin:8096`, modifiez `proxy_pass` dans `deploy/nginx.conf`.

**Traefik** : `deploy/cine.yml` est un exemple de routeur (à adapter : domaine, *entryPoint*, résolveur de certificats).

### Autoriser les applis (CORS)

Les applis parlent directement au serveur Jellyfin. Jellyfin répond aux requêtes CORS tout seul, mais un reverse proxy qui ajoute ses propres en-têtes CORS (ou une chaîne de sécurité) peut bloquer les pré-requêtes : l'appli trouve le serveur mais la connexion échoue. `deploy/jellyfin-cors.yml` définit un middleware Traefik qui les autorise ; `install-vps.sh` le dépose dans `TRAEFIK_RULES` et le place **en tête** des middlewares du routeur Jellyfin (après avoir sauvegardé le fichier dans `~`).

## Personnaliser

- **Logo** : remplacez `brand/logo-source.png` (icône carrée sur fond sombre, ou PNG transparent), puis `python brand/build-icons.py`. Le script (Python + Pillow, rendu par Edge, Chrome ou Chromium — variable `BROWSER` sinon) régénère les icônes du site et, s'ils sont clonés à côté, celles de `cine-android` et `cine-webos`.
- **Couleurs** : variables CSS en tête de `src/app.css` (`--gold`, `--gold-grad`, `--bg`…) ; pour l'appli Android, `res/values/colors.xml` dans `cine-android`.
- **Nom** : `index.html`, `public/manifest.webmanifest` et `src/components/Brand.svelte`.

## Organisation du code

```
src/
  pages/        Accueil, Séries/Films, Fiche, Lecteur, Recherche, Profils, Connexion, Réglages, Administration
  components/   barre du haut, affiche, rangées, vignettes, « Lire sur… », télécommande
  lib/          jellyfin.ts (client de l'API), profile.ts (formats lisibles), remote.svelte.ts (diffusion),
                tv.ts (télécommande, pont avec l'appli Android), prefs.svelte.ts (réglages), admin.ts
brand/          logo source + build-icons.py
deploy/         nginx.conf, docker-compose.yml, install-vps.sh, exemples Traefik
```

L'appli Android expose un pont JavaScript `SelvaniaTV` (`play`, `cast`, `canCast`, `checkUpdate`, `version`) : quand il est présent, la lecture passe par le lecteur natif.

## À savoir (Jellyfin 10.10 / 12)

- Le WebSocket exige le paramètre `ApiKey=`.
- Les sessions ne conservent pas toujours la file d'attente : celle de la barre de télécommande est reconstruite à partir de la série.
- Quick Connect doit être activé sur le serveur (Tableau de bord › Général, ou depuis la page Administration).

## Contribuer

Voir [`CONTRIBUTING.md`](CONTRIBUTING.md). Ce projet est développé en **vibe coding** : le code est écrit en grande partie par une IA (Claude, d'Anthropic) à partir des demandes et des essais de l'auteur — relisez et testez, et signalez ce qui ne va pas.

## Licence

[GNU GPL v3](LICENSE). Jellyfin est une marque de son projet ; Selvania Ciné n'est pas affilié à Jellyfin.
