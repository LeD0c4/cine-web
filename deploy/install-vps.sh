#!/usr/bin/env bash
# Installe / met à jour Selvania Ciné sur le VPS et autorise les applis (CORS) devant Jellyfin.
#
#   mkdir -p /tmp/cine && tar -xzf ~/cine-web.tgz -C /tmp/cine && bash /tmp/cine/install-vps.sh
#
# Dossiers (modifiables par variables d'environnement) :
#   CINE_DIR      dossier de Ciné (docker compose + site)       défaut : ~/docker/cine-web
#   TRAEFIK_RULES dossier des règles « file » de Traefik         défaut : ~/docker/traefik/rules
#   JELLYFIN_RULE fichier de règles du routeur Jellyfin          défaut : $TRAEFIK_RULES/jellyfin.yml
set -euo pipefail

PACK="$(cd "$(dirname "$0")" && pwd)"
CINE_DIR="${CINE_DIR:-$HOME/docker/cine-web}"
TRAEFIK_RULES="${TRAEFIK_RULES:-$HOME/docker/traefik/rules}"
JELLYFIN_RULE="${JELLYFIN_RULE:-$TRAEFIK_RULES/jellyfin.yml}"
STAMP="$(date +%Y%m%d-%H%M%S)"

echo "== Selvania Ciné → $CINE_DIR"
mkdir -p "$CINE_DIR"
if [ -d "$CINE_DIR/dist" ]; then
  tar -czf "$HOME/cine-web-sauvegarde-$STAMP.tgz" -C "$CINE_DIR" dist
  echo "   ancienne version sauvegardée : ~/cine-web-sauvegarde-$STAMP.tgz"
fi
# Mise à jour DANS le dossier existant : le conteneur nginx y est attaché ; remplacer le dossier
# lui ferait garder l'ancien (supprimé) et répondre « 500 ».
mkdir -p "$CINE_DIR/dist"
find "$CINE_DIR/dist" -mindepth 1 -delete
cp -r "$PACK/dist/." "$CINE_DIR/dist/"
for f in nginx.conf docker-compose.yml; do cp "$PACK/$f" "$CINE_DIR/$f"; done
# Le .env (réseau Docker de Traefik) est conservé ; créé seulement à la première installation.
[ -f "$CINE_DIR/.env" ] || cp "$PACK/.env" "$CINE_DIR/.env"
if grep -q 'a-remplacer' "$CINE_DIR/.env"; then
  echo "   ⚠ Réglez TRAEFIK_NETWORK dans $CINE_DIR/.env (réseau Docker de Traefik et Jellyfin), puis relancez ce script."
else
  # « restart » : nginx relit la configuration et repart sur les nouveaux fichiers.
  (cd "$CINE_DIR" && docker compose up -d && docker compose restart)
fi

echo "== Traefik : middleware jellyfin-cors (applis Android / LG / Xbox)"
if [ ! -f "$JELLYFIN_RULE" ]; then
  echo "   ⚠ $JELLYFIN_RULE introuvable : indiquez le bon fichier avec JELLYFIN_RULE=… et relancez."
  exit 1
fi
if grep -q 'jellyfin-cors:' "$TRAEFIK_RULES"/*.yml 2>/dev/null; then
  echo "   middleware déjà défini ($(grep -l 'jellyfin-cors:' "$TRAEFIK_RULES"/*.yml | xargs -n1 basename | tr '\n' ' '))"
else
  cp "$PACK/jellyfin-cors.yml" "$TRAEFIK_RULES/jellyfin-cors.yml"
  echo "   ajouté : $TRAEFIK_RULES/jellyfin-cors.yml"
fi
if grep -q 'jellyfin-cors@file' "$JELLYFIN_RULE"; then
  echo "   déjà branché sur le routeur Jellyfin"
else
  # Sauvegarde hors du dossier des règles (Traefik lit tout ce dossier).
  cp "$JELLYFIN_RULE" "$HOME/$(basename "$JELLYFIN_RULE").sauvegarde-$STAMP"
  # En tête de chaque liste « middlewares: » de routeur : une chaîne placée avant (en-têtes CORS
  # restrictifs, authentification…) répondrait sinon elle-même aux pré-requêtes, sans autoriser l'appli.
  awk '{
    if (pending && match($0, /^[ \t]*- /)) print substr($0, 1, RLENGTH - 2) "- jellyfin-cors@file"
    pending = 0
    print
    if ($0 ~ /^[ \t]*middlewares:[ \t]*$/) pending = 1
  }' "$JELLYFIN_RULE" > "$JELLYFIN_RULE.tmp" && mv "$JELLYFIN_RULE.tmp" "$JELLYFIN_RULE"
  if grep -q 'jellyfin-cors@file' "$JELLYFIN_RULE"; then
    echo "   branché sur le routeur Jellyfin (sauvegarde : ~/$(basename "$JELLYFIN_RULE").sauvegarde-$STAMP)"
  else
    echo "   ⚠ pas de liste « middlewares: » dans $JELLYFIN_RULE : ajoutez « - jellyfin-cors@file » aux middlewares du routeur Jellyfin."
  fi
fi
grep -n -B3 -A3 'jellyfin-cors@file' "$JELLYFIN_RULE" || true
echo "== Terminé. Traefik relit ses règles tout seul (quelques secondes)."
