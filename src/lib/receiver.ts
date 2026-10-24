// Chaque Ciné ouvert (Xbox, télé LG, PC…) se déclare à Jellyfin comme appareil pilotable :
// il apparaît dans « Lire sur… » des autres appareils et reçoit les ordres (lire, pause, avancer…).

import { jf, DEVICE_ID, TICKS, socketUrl } from './jellyfin';
import { router, links } from './router.svelte';

export type RemoteCommand = { command: string; ticks?: number };

let socket: WebSocket | null = null;
let keepAlive: ReturnType<typeof setInterval> | undefined;
let retry: ReturnType<typeof setTimeout> | undefined;
let token = '';

function handle(msg: { MessageType: string; Data?: any }) {
  switch (msg.MessageType) {
    case 'ForceKeepAlive': {
      clearInterval(keepAlive);
      const every = Math.max(10, Number(msg.Data) || 60) * 500;
      keepAlive = setInterval(() => socket?.readyState === 1 && socket.send(JSON.stringify({ MessageType: 'KeepAlive' })), every);
      break;
    }
    case 'Play': {
      // « Lire sur… » depuis un autre appareil : on ouvre le lecteur sur le titre demandé.
      const id = msg.Data?.ItemIds?.[0];
      if (!id) break;
      const ticks = Number(msg.Data?.StartPositionTicks) || 0;
      router.go(`${links.play(id)}${ticks ? `?t=${Math.round(ticks / TICKS)}` : '?t=0'}`);
      break;
    }
    case 'Playstate':
      window.dispatchEvent(new CustomEvent<RemoteCommand>('selvania:remote', {
        detail: { command: msg.Data?.Command, ticks: msg.Data?.SeekPositionTicks },
      }));
      break;
  }
}

function open() {
  if (!token) return;
  const url = socketUrl(`/socket?ApiKey=${encodeURIComponent(token)}&deviceId=${encodeURIComponent(DEVICE_ID)}`);
  const ws = new WebSocket(url);
  socket = ws;
  ws.onmessage = (e) => {
    try {
      handle(JSON.parse(e.data));
    } catch {
      /* message illisible */
    }
  };
  ws.onclose = () => {
    clearInterval(keepAlive);
    if (socket === ws && token) retry = setTimeout(open, 10000);
  };
}

/** À appeler à chaque changement de profil (connexion, changement, déconnexion). */
export async function startReceiver() {
  stopReceiver();
  token = jf.token;
  if (!token) return;
  try {
    await jf.post('/Sessions/Capabilities/Full', {
      PlayableMediaTypes: ['Video'],
      SupportedCommands: ['DisplayMessage'],
      SupportsMediaControl: true,
      SupportsPersistentIdentifier: true,
    });
  } catch {
    /* le serveur refuse : on reste simple lecteur */
    return;
  }
  open();
}

export function stopReceiver() {
  token = '';
  clearTimeout(retry);
  clearInterval(keepAlive);
  const ws = socket;
  socket = null;
  ws?.close();
}
