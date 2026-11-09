// Data generation of the local edition (Plan 12). A restore replaces every row and
// changes the generation; the server rejects writes that carry an older one, and the
// browser keeps pending operations and drafts per generation so none is replayed
// on restored data.
import { isLocalEdition } from './edition';
import { GENERATION_CHANGED, GENERATION_HEADER } from './localUser';

const CHANNEL = 'chambapp-datos';
let current: string | null = null;
let reloading = false;

export const dataGeneration = () => current;

/** Reloads every tab (once): their in-memory state belongs to the old data. */
export function reloadForNewData() {
  if (reloading) return;
  reloading = true;
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage('recargar');
    channel.close();
  } catch {
    // Other tabs notice on their next load (≤ 30 s).
  }
  window.location.reload();
}

if (isLocalEdition && typeof BroadcastChannel !== 'undefined') {
  try {
    new BroadcastChannel(CHANNEL).onmessage = () => {
      reloading = true;
      window.location.reload();
    };
  } catch {
    // Not available: the periodic load still detects the change.
  }
}

/** Records the generation read from the server. A different one means another tab restored a backup. */
export function setDataGeneration(next: string) {
  if (current && current !== next) {
    reloadForNewData();
    return;
  }
  current = next;
}

/**
 * Storage scope for pending operations and drafts: the user in the cloud edition,
 * user + generation in the local one (null until the generation is known).
 */
export function storageScope(
  userId: string | null | undefined,
  generation: string | null | undefined,
) {
  if (!userId) return null;
  if (!isLocalEdition) return userId;
  return generation ? `${userId}:${generation}` : null;
}

/** fetch for the local API: sends the generation and reloads when it is stale. */
export const generationFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  if (current) headers.set(GENERATION_HEADER, current);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 409) {
    const text = await response
      .clone()
      .text()
      .catch(() => '');
    if (text.includes(GENERATION_CHANGED)) setTimeout(reloadForNewData, 2500);
  }
  return response;
};
