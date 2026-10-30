import { useState, useRef, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FeedbackContext } from './FeedbackContext';
import type { FeedbackTone } from './FeedbackContext';
import { IconButton } from '../ui/Button';
import { Icon } from '../ui/Icon';

const icons = { info: 'info', success: 'success', error: 'alert' } as const;

/** Guess the tone from older callers that only pass text. */
function inferTone(text: string): FeedbackTone {
  return /^(no se|error|no ha|no puede|ha fallado)/i.test(text) ? 'error' : 'info';
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; text: string; tone: FeedbackTone } | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((text: string, tone?: FeedbackTone) => {
    clearTimeout(timeout.current);
    const resolved = tone ?? inferTone(text);
    setToast({ id: Date.now(), text, tone: resolved });
    // Errors stay longer so they can be read; every toast can be closed manually.
    timeout.current = setTimeout(() => setToast(null), resolved === 'error' ? 9000 : 5000);
  }, []);
  useEffect(() => () => clearTimeout(timeout.current), []);
  return (
    <FeedbackContext.Provider value={notify}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        <AnimatePresence>
          {toast ? (
            <motion.div
              key={toast.id}
              className={`toast toast--${toast.tone}`}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <Icon name={icons[toast.tone]} />
              <span>{toast.text}</span>
              <IconButton icon="close" label="Cerrar aviso" onClick={() => setToast(null)} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </FeedbackContext.Provider>
  );
}
