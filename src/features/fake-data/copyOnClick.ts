import type { MouseEvent } from 'react';

/** Pointer movement (px) between press and release that counts as a drag. */
const DRAG_DISTANCE = 4;

/**
 * Click on a generated value copies it (the copy icon still works for keyboard
 * users). Dragging to select text is a selection gesture and never copies.
 */
export function copyOnClick(copy: () => void) {
  return {
    className: 'fake-copyable',
    title: 'Clic para copiar',
    onMouseDown: (event: MouseEvent<HTMLElement>) => {
      event.currentTarget.dataset.downX = String(event.clientX);
      event.currentTarget.dataset.downY = String(event.clientY);
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      const { downX, downY } = event.currentTarget.dataset;
      const moved =
        downX !== undefined &&
        downY !== undefined &&
        Math.hypot(event.clientX - Number(downX), event.clientY - Number(downY)) > DRAG_DISTANCE;
      if (moved) return;
      copy();
    },
  };
}
