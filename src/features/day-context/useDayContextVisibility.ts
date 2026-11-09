import { useState } from 'react';

const STORAGE_KEY = 'chambapp:contexto-dia';
const NARROW = '(max-width: 959px)';

function initialVisibility() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'visible') return true;
    if (stored === 'oculto') return false;
  } catch {
    // Storage blocked: fall back to the screen size.
  }
  return !window.matchMedia?.(NARROW).matches;
}

/** Whether the day panel is shown; the choice is remembered in this browser. */
export function useDayContextVisibility() {
  const [visible, setVisible] = useState(initialVisibility);
  function toggle() {
    setVisible((current) => {
      try {
        localStorage.setItem(STORAGE_KEY, current ? 'oculto' : 'visible');
      } catch {
        // Not remembered; the toggle still works for this form.
      }
      return !current;
    });
  }
  return { visible, toggle };
}
