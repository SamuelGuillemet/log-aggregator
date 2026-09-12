import { type RefObject, useEffect, useState } from "react";

/** Tracks the scroll container width so the last column can absorb the slack. */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    setWidth(element.clientWidth);

    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return width;
}
