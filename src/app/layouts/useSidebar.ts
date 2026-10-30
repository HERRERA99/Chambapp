import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { parseSidebarPreference, sidebarStorageKey } from '../navigation';
import type { SidebarPreference } from '../navigation';

const mobileQuery = '(max-width: 900px)';

function subscribe(callback: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(mobileQuery).matches,
    () => false,
  );
}

function readPreference() {
  try {
    return parseSidebarPreference(window.localStorage.getItem(sidebarStorageKey));
  } catch {
    // Storage can be blocked (private mode, policies); the menu still works for this visit.
    return parseSidebarPreference(null);
  }
}

/** Desktop menu preference (visible/hidden and expanded/icons), kept between visits. */
export function useSidebarPreference() {
  const [preference, setPreference] = useState<SidebarPreference>(readPreference);
  useEffect(() => {
    try {
      window.localStorage.setItem(sidebarStorageKey, JSON.stringify(preference));
    } catch {
      /* Not persisted when storage is unavailable. */
    }
  }, [preference]);
  const update = useCallback(
    (change: Partial<SidebarPreference>) => setPreference((current) => ({ ...current, ...change })),
    [],
  );
  return [preference, update] as const;
}

const toolsKey = 'chambapp:sidebar-tools';

export function useToolsGroupOpen(active: boolean) {
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(toolsKey) === 'open';
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setOpen((current) => {
      try {
        window.localStorage.setItem(toolsKey, current ? 'closed' : 'open');
      } catch {
        /* Session-only preference. */
      }
      return !current;
    });
  }, []);
  // The group containing the current page is always shown.
  return [open || active, toggle] as const;
}
