import { type RefObject, useEffect, useState } from "react";

export function useScrollAreaWidth(
  parentRef: RefObject<HTMLDivElement | null>,
): number {
  const [scrollAreaWidth, setScrollAreaWidth] = useState(0);

  useEffect(() => {
    const element = parentRef.current;

    if (!element) {
      return;
    }

    setScrollAreaWidth(element.clientWidth);

    const resizeObserver = new ResizeObserver(() => {
      setScrollAreaWidth(element.clientWidth);
    });

    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, [parentRef]);

  return scrollAreaWidth;
}
