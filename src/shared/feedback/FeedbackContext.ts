import { createContext, useContext } from 'react';

export type FeedbackTone = 'info' | 'success' | 'error';
export type Notify = (message: string, tone?: FeedbackTone) => void;

export const FeedbackContext = createContext<Notify | null>(null);

export function useFeedback() {
  const notify = useContext(FeedbackContext);
  if (!notify) throw new Error('useFeedback requiere FeedbackProvider.');
  return notify;
}
