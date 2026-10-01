import { createContext, useContext } from 'react';

export const FeedbackContext = createContext<((message: string) => void) | null>(null);

export function useFeedback() {
  const notify = useContext(FeedbackContext);
  if (!notify) throw new Error('useFeedback requiere FeedbackProvider.');
  return notify;
}
