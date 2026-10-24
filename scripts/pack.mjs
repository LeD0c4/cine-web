// Prépare cine-web.tgz pour le VPS : interface compilée + nginx + docker compose + règle Traefik.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
execSync('npm run build', { stdio: 'inherit' });

const out = path.join(root, '.pack');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
fs.cpSync('dist', path.join(out, 'dist'), { recursive: true });

// Applis Android à télécharger depuis la télé ou le téléphone : https://cine.example.com/apps/…
const apks = path.join(root, '..', 'cine-android', 'apk');
if (fs.existsSync(apks)) {
  fs.mkdirSync(path.join(out, 'dist', 'apps'));
  for (const f of fs.readdirSync(apks).filter((n) => n.endsWith('.apk'))) {
    fs.copyFileSync(path.join(apks, f), path.join(out, 'dist', 'apps', f.toLowerCase()));
  }
}
for (const f of ['nginx.conf', 'docker-compose.yml', 'cine.yml', 'jellyfin-cors.yml', 'install-vps.sh']) {
  // Fins de ligne Unix pour le serveur.
  fs.writeFileSync(path.join(out, f), fs.readFileSync(path.join('deploy', f), 'utf8').replace(/\r\n/g, '\n'));
}
if (!fs.existsSync(path.join(out, '.env'))) fs.writeFileSync(path.join(out, '.env'), 'TRAEFIK_NETWORK=a-remplacer\n');

execSync(`tar -czf cine-web.tgz -C .pack .`, { stdio: 'inherit' });
fs.rmSync(out, { recursive: true, force: true });
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
console.log(`\ncine-web.tgz prêt (version ${version}).`);
