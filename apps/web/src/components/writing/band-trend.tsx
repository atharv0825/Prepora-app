"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { writingSubmissionPath } from "@/lib/routes";

export type TrendPoint = { id: string; band: number; date: string; label: string };

const HEIGHT = 200;
const PAD = { top: 16, right: 40, bottom: 28, left: 32 };

/**
 * M6-F4: band over time for the last scored answers (one series, so no legend: the heading names
 * it). Marks per the dataviz spec: a 2px line, 8px markers with a 2px surface ring, hairline
 * gridlines at whole bands, the latest band labelled at the line's end. Colour validated with the
 * dataviz palette script: #1F8A70 on the light card, #34B583 on the dark card (#0F3B47).
 * Hover: a crosshair snaps to the nearest answer with a tooltip; keyboard: each point is a
 * focusable link with the same tooltip. The history list under the chart is its table view.
 */
export function BandTrend({ points }: { points: TrendPoint[] }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!points.length) return null;
  const lo = Math.max(0, Math.min(4, Math.floor(Math.min(...points.map((p) => p.band)) - 0.5)));
  const hi = 9;
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (band: number) => PAD.top + ((hi - band) / (hi - lo)) * innerH;
  const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.band).toFixed(1)}`).join(" ");
  const last = points.length - 1;

  function nearest(clientX: number): number {
    const rect = box.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = 0;
    points.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    return best;
  }

  const tip = active !== null ? points[active]! : null;

  return (
    <div ref={box} className="relative w-full" data-testid="band-trend">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Writing band over your last ${points.length} answers: from ${points[0]!.band.toFixed(1)} to ${points[last]!.band.toFixed(1)}`}
        onPointerMove={(e) => setActive(nearest(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onClick={(e) => {
          if (e.target instanceof SVGElement && e.target.closest("a")) return;
          router.push(writingSubmissionPath(points[nearest(e.clientX)]!.id));
        }}
        className="block cursor-pointer overflow-visible"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-foreground/10" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
              {t}
            </text>
          </g>
        ))}
        {tip && active !== null && (
          <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="stroke-foreground/30" strokeWidth={1} />
        )}
        {points.length > 1 && (
          <path d={path} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-[#1F8A70] dark:stroke-[#34B583]" />
        )}
        {points.map((p, i) => (
          <a
            key={p.id}
            href={writingSubmissionPath(p.id)}
            aria-label={`${p.label}, ${p.date}: band ${p.band.toFixed(1)}`}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            onClick={(e) => {
              e.preventDefault();
              router.push(writingSubmissionPath(p.id));
            }}
            className="outline-none [&:focus-visible>circle]:stroke-ring"
          >
            {/* A bigger invisible target than the 8px dot. */}
            <circle cx={x(i)} cy={y(p.band)} r={12} fill="transparent" />
            <circle
              cx={x(i)}
              cy={y(p.band)}
              r={active === i ? 5.5 : 4}
              strokeWidth={2}
              className="fill-[#1F8A70] stroke-card dark:fill-[#34B583]"
            />
          </a>
        ))}
        <text x={x(last) + 12} y={y(points[last]!.band)} dy="0.32em" className="fill-foreground text-xs font-semibold tabular-nums">
          {points[last]!.band.toFixed(1)}
        </text>
        <text x={PAD.left} y={HEIGHT - 6} className="fill-muted-foreground text-[11px]">
          {points[0]!.date}
        </text>
        {points.length > 1 && (
          <text x={width - PAD.right} y={HEIGHT - 6} textAnchor="end" className="fill-muted-foreground text-[11px]">
            {points[last]!.date}
          </text>
        )}
      </svg>
      {tip && active !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 w-max max-w-64 rounded-xl border border-foreground/10 bg-popover px-3 py-2 text-xs whitespace-nowrap text-popover-foreground shadow-md"
          // Below the point when it's near the top; kept inside the chart horizontally.
          style={{
            left: Math.min(Math.max(x(active), 90), width - 90),
            top: y(tip.band) < 70 ? y(tip.band) + 14 : y(tip.band) - 14,
            transform: `translate(-50%, ${y(tip.band) < 70 ? "0" : "-100%"})`,
          }}
        >
          <p className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-3 rounded bg-[#1F8A70] dark:bg-[#34B583]" aria-hidden />
            <strong className="text-sm tabular-nums">{tip.band.toFixed(1)}</strong>
          </p>
          <p className="max-w-60 truncate text-muted-foreground">
            {tip.label} · {tip.date}
          </p>
        </div>
      )}
    </div>
  );
}
