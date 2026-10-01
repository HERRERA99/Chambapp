import { createContext, useContext } from 'react';

export const PreviewContext = createContext<((message: string) => void) | null>(null);

export function usePreviewNotice() {
  const notify = useContext(PreviewContext);
  if (!notify) throw new Error('usePreviewNotice requiere PreviewProvider.');
  return notify;
}
