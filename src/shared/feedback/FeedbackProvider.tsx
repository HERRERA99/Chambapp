import { useState, useRef, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { FeedbackContext } from './FeedbackContext';
import { IconButton } from '../ui/Button';
import { Icon } from '../ui/Icon';

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((text: string) => {
    clearTimeout(timeout.current);
    setMessage(text);
    timeout.current = setTimeout(() => setMessage(''), 6000);
  }, []);
  useEffect(() => () => clearTimeout(timeout.current), []);
  return (
    <FeedbackContext.Provider value={notify}>
      {children}
      <div className={`toast ${message ? 'toast--visible' : ''}`} role="status" aria-live="polite">
        {message ? (
          <>
            <Icon name="info" />
            <span>{message}</span>
            <IconButton icon="close" label="Cerrar aviso" onClick={() => setMessage('')} />
          </>
        ) : null}
      </div>
    </FeedbackContext.Provider>
  );
}
