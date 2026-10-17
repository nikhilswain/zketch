import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";

interface MasonryColumnsProps {
  items: { key: string; aspect: number; node: React.ReactNode }[];
  minColumnWidth?: number;
  gap?: number;
}

const MasonryColumns: React.FC<MasonryColumnsProps> = ({ items, minColumnWidth = 220, gap = 12 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setColumns(Math.max(1, Math.floor((el.clientWidth + gap) / (minColumnWidth + gap))));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [minColumnWidth, gap]);

  const cols: { key: string; node: React.ReactNode }[][] = Array.from({ length: columns }, () => []);
  const heights = new Array(columns).fill(0);
  for (const item of items) {
    const i = heights.indexOf(Math.min(...heights));
    cols[i].push(item);
    heights[i] += 1 / item.aspect + 0.35;
  }

  return (
    <div ref={ref} className="flex items-start" style={{ gap }}>
      {cols.map((col, i) => (
        <ul key={i} className="flex min-w-0 flex-1 flex-col" style={{ gap }}>
          {col.map((item) => (
            <li key={item.key}>{item.node}</li>
          ))}
        </ul>
      ))}
    </div>
  );
};

export default MasonryColumns;
