import { ApiError } from './jellyfin';
import { session } from './session.svelte';

/** Erreur d'un appel : une session refusée renvoie au choix des profils. */
export function handle(err: unknown): string {
  if (err instanceof ApiError && err.status === 401 && session.current) {
    session.forget(session.current, false);
    return 'Session expirée : reconnectez-vous.';
  }
  return err instanceof Error ? err.message : String(err);
}
