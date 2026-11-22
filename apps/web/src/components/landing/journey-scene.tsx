"use client";

import { useEffect, useRef, useState } from "react";

/*
 * Cartoon "journey" film (design doc §4): a plane flies in from the left, lands in New York
 * (Statue of Liberty + skyline with the Empire State Building), and the student steps out and
 * walks into NYU (building with NYU-violet flags and an "NYU" banner). One 13 s loop.
 *
 * Everything is a pure function of the loop time `ms`, drawn in one SVG. Transparent background:
 * it sits straight on the page at the bottom of the Modules section (no card).
 * Runs only while on screen and the tab is visible; reduced motion shows the final frame.
 */

const LOOP = 13000;
const G = 262; // ground line (y)
const BODY_Y = G - 34; // plane body centre when on the ground (wheels reach the ground)
const CRUISE = 110; // flying height above the ground pose
const DOOR = 40; // door x offset from the plane centre

// Palette (literal: Tailwind only emits theme variables that some class uses).
const C = {
  ink: "#08222b",
  teal: "#1c5f66",
  sea: "#37918a",
  mint: "#68c1a7",
  mist: "#a7e6c9",
  foam: "#eafaf0",
  primary: "#3fc48c",
  rust: "#8c3f3f",
  grid: "#e7eaea",
  skin: "#e3ad84",
  flame: "#e2a33b",
  nyu: "#57068c", // NYU violet: flags and banner only, so the building reads as NYU
};
const rust = (pct: number) => `color-mix(in oklab, ${C.rust} ${pct}%, white)`;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (ms: number, a: number, b: number) => clamp01((ms - a) / (b - a));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const smooth = (p: number) => p * p * (3 - 2 * p);
const easeOut = (p: number) => 1 - (1 - p) * (1 - p);

/** Plane centre (x, y offset above the ground pose) over the loop. */
function planeAt(ms: number): { x: number; dy: number } {
  if (ms < 2600) return { x: lerp(-120, 220, seg(ms, 0, 2600)), dy: -CRUISE }; // flies in
  if (ms < 5000) {
    const p = seg(ms, 2600, 5000); // long, gentle descent (max ~16° nose down)
    return { x: lerp(220, 560, p), dy: -CRUISE * (1 - smooth(p)) };
  }
  return { x: lerp(560, LANDED, easeOut(seg(ms, 5000, 6000))), dy: 0 }; // roll-out
}
const LANDED = 640; // plane centre when parked

// Dashed flight path: sampled from the plane's own motion up to touchdown, so the plane always
// flies exactly along it.
const FLIGHT_PATH = Array.from({ length: 51 }, (_, i) => {
  const p = planeAt(i * 100);
  return `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${(BODY_Y + p.dy).toFixed(1)}`;
}).join(" ");

const STAIRS = { tx: LANDED + DOOR + 2, bx: LANDED + DOOR + 32 };
const NYU_DOOR = 870;

type Pose = { x: number; y: number; visible: boolean; walking: boolean; opacity: number };

/** Student position over the loop: off the plane, down the stairs, into NYU. */
function studentAt(ms: number): Pose {
  const hidden = { x: STAIRS.tx, y: G - 21, visible: false, walking: false, opacity: 0 };
  if (ms < 6600) return hidden;
  if (ms < 6900) return { x: STAIRS.tx, y: G - 21, visible: true, walking: false, opacity: seg(ms, 6600, 6900) };
  if (ms < 7500) {
    const p = seg(ms, 6900, 7500); // down the stairs
    return { x: lerp(STAIRS.tx, STAIRS.bx, p), y: lerp(G - 21, G, p), visible: true, walking: true, opacity: 1 };
  }
  if (ms < 9300)
    return { x: lerp(STAIRS.bx, NYU_DOOR, seg(ms, 7500, 9300)), y: G, visible: true, walking: true, opacity: 1 };
  if (ms < 9900) return { x: NYU_DOOR, y: G, visible: true, walking: false, opacity: 1 - seg(ms, 9300, 9900) }; // goes in
  return hidden;
}

function Plane({ x, dy, angle, gear }: { x: number; dy: number; angle: number; gear: number }) {
  return (
    <g transform={`translate(${x} ${BODY_Y + dy}) rotate(${angle})`}>
      {/* landing gear (retracts in the air) */}
      <g opacity={gear} stroke={C.ink} strokeWidth={2}>
        <line x1={-40} y1={12} x2={-40} y2={30} />
        <line x1={48} y1={12} x2={48} y2={30} />
        <circle cx={-40} cy={30} r={4} fill={C.ink} />
        <circle cx={48} cy={30} r={4} fill={C.ink} />
      </g>
      {/* tail fin */}
      <path d="M-74 -10 L-92 -46 H-72 L-46 -12 Z" fill={C.primary} stroke={C.ink} strokeWidth={1.5} strokeLinejoin="round" />
      {/* fuselage */}
      <path
        d="M-82 -4 Q-82 -16 -66 -16 H52 Q84 -16 88 2 Q84 16 52 16 H-66 Q-82 16 -82 4 Z"
        fill="white"
        stroke={C.ink}
        strokeWidth={1.5}
      />
      <rect x={-72} y={5} width={130} height={4} rx={2} fill={C.rust} />
      {Array.from({ length: 8 }, (_, i) => (
        <circle key={i} cx={-56 + i * 11} cy={-5} r={2.6} fill={C.teal} />
      ))}
      {/* cockpit */}
      <path d="M66 -9 Q79 -9 83 -1 H66 Z" fill={C.ink} />
      {/* door */}
      <rect x={DOOR - 5} y={-11} width={10} height={22} rx={3} fill="white" stroke={C.ink} strokeWidth={1.2} />
      {/* wing */}
      <path d="M-6 4 L-38 26 H-22 L22 6 Z" fill={C.mist} stroke={C.ink} strokeWidth={1.5} strokeLinejoin="round" />
    </g>
  );
}

function Student({ pose, ms }: { pose: Pose; ms: number }) {
  if (!pose.visible) return null;
  const swing = pose.walking ? Math.sin(ms / 85) * 22 : 0;
  const bob = pose.walking ? Math.abs(Math.sin(ms / 85)) * 1.5 : 0;
  return (
    <g transform={`translate(${pose.x} ${pose.y - bob}) scale(1.15)`} opacity={pose.opacity}>
      {/* legs */}
      <g stroke={C.ink} strokeWidth={3} strokeLinecap="round">
        <line x1={0} y1={-12} x2={0} y2={0} transform={`rotate(${swing} 0 -12)`} />
        <line x1={0} y1={-12} x2={0} y2={0} transform={`rotate(${-swing} 0 -12)`} />
      </g>
      {/* suitcase */}
      <rect x={-15} y={-13} width={9} height={11} rx={2} fill={C.rust} />
      <path d="M-13 -13 V-15 H-8 V-13" fill="none" stroke={C.rust} strokeWidth={1.2} />
      {/* body */}
      <rect x={-5} y={-25} width={10} height={14} rx={4} fill={C.primary} />
      {/* back arm (holds the suitcase) */}
      <line x1={-2} y1={-21} x2={-9} y2={-14} stroke={C.ink} strokeWidth={2.4} strokeLinecap="round" />
      {/* front arm: swings when walking */}
      <line
        x1={2}
        y1={-21}
        x2={7}
        y2={-14}
        stroke={C.ink}
        strokeWidth={2.4}
        strokeLinecap="round"
        transform={`rotate(${-swing * 0.6} 2 -21)`}
      />
      {/* head + hair */}
      <circle cx={0} cy={-30} r={5.5} fill={C.skin} />
      <path d="M-5.5 -31 Q-5 -37 0 -36.5 Q5 -37 5.5 -31 Q2 -33.5 -5.5 -31 Z" fill={C.ink} />
    </g>
  );
}

function Stairs({ top, bottom, opacity }: { top: [number, number]; bottom: [number, number]; opacity: number }) {
  const steps = 4;
  return (
    <g opacity={opacity} stroke={C.teal} strokeWidth={1.6} strokeLinecap="round">
      <line x1={bottom[0]} y1={bottom[1]} x2={top[0]} y2={top[1]} />
      <line x1={bottom[0]} y1={bottom[1] - 8} x2={top[0]} y2={top[1] - 8} />
      {Array.from({ length: steps }, (_, i) => {
        const p = (i + 0.5) / steps;
        const x = lerp(bottom[0], top[0], p);
        const y = lerp(bottom[1], top[1], p);
        return <line key={i} x1={x} y1={y} x2={x} y2={y - 8} />;
      })}
    </g>
  );
}

/** NYU: academic building with NYU-violet flags on the roof and an "NYU" banner over the door. */
function Nyu({ doorOpen }: { doorOpen: number }) {
  const x0 = 790;
  const w = 160;
  const h = 104;
  const brick = rust(18);
  const line = rust(60);
  return (
    <g strokeLinejoin="round">
      {/* flags */}
      {[x0 + 18, x0 + w - 18].map((x) => (
        <g key={x}>
          <line x1={x} y1={G - h} x2={x} y2={G - h - 34} stroke={C.ink} strokeWidth={1.4} />
          <path d={`M${x} ${G - h - 34} h22 l-5 6 l5 6 h-22 Z`} fill={C.nyu} />
        </g>
      ))}
      {/* building */}
      <rect x={x0} y={G - h} width={w} height={h} fill={brick} stroke={line} strokeWidth={1.5} />
      <rect x={x0 - 6} y={G - h - 6} width={w + 12} height={8} fill={brick} stroke={line} strokeWidth={1.5} />
      {/* windows */}
      <g fill="white" stroke={line} strokeWidth={1}>
        {[0, 1, 2, 3, 4, 5].flatMap((c) =>
          [0, 1].map((r) => (
            <rect key={`${c}-${r}`} x={x0 + 12 + c * 24} y={G - h + 12 + r * 26} width={12} height={16} rx={1} />
          )),
        )}
      </g>
      {/* banner + door */}
      <rect x={NYU_DOOR - 30} y={G - 50} width={60} height={16} rx={2} fill={C.nyu} />
      <text x={NYU_DOOR} y={G - 37.5} textAnchor="middle" fontSize={13} fontWeight={700} fill="white" letterSpacing={2}>
        NYU
      </text>
      <rect x={NYU_DOOR - 12} y={G - 30} width={24} height={30} rx={2} fill="white" stroke={line} strokeWidth={1.5} />
      <rect x={NYU_DOOR - 12} y={G - 30} width={24} height={30} rx={2} fill={C.ink} opacity={doorOpen} />
    </g>
  );
}

/** New York: skyline with the Empire State Building, Statue of Liberty in front. */
function NewYork() {
  const towers = [
    { x: 992, w: 26, h: 92 },
    { x: 1018, w: 20, h: 120 },
    { x: 1086, w: 24, h: 104 },
    { x: 1148, w: 28, h: 130 },
    { x: 1176, w: 22, h: 86 },
  ];
  return (
    <g>
      {/* skyline */}
      <g fill={C.foam} stroke={C.mint} strokeWidth={1.2}>
        {towers.map((t) => (
          <rect key={t.x} x={t.x} y={G - t.h} width={t.w} height={t.h} />
        ))}
        {/* Empire State Building: stepped tower with a spire */}
        <rect x={1040} y={G - 128} width={40} height={128} />
        <rect x={1046} y={G - 156} width={28} height={28} />
        <rect x={1052} y={G - 176} width={16} height={20} />
        <rect x={1056} y={G - 188} width={8} height={12} />
        <line x1={1060} y1={G - 188} x2={1060} y2={G - 214} />
      </g>
      {/* windows */}
      <g fill={C.mist}>
        {[1048, 1058, 1068].flatMap((x) =>
          [110, 90, 70, 50, 30].map((y) => <rect key={`${x}-${y}`} x={x} y={G - y} width={4} height={8} />),
        )}
      </g>
      {/* Statue of Liberty */}
      <g fill={C.sea} stroke={C.teal} strokeWidth={1.2} strokeLinejoin="round">
        <rect x={1100} y={G - 46} width={44} height={46} fill={C.foam} stroke={C.mint} />
        <rect x={1106} y={G - 54} width={32} height={8} fill={C.foam} stroke={C.mint} />
        <path d={`M1110 ${G - 54} L1115 ${G - 116} H1129 L1134 ${G - 54} Z`} />
        {/* tablet arm */}
        <rect x={1105} y={G - 104} width={8} height={14} rx={1} transform={`rotate(-12 1109 ${G - 97})`} />
        {/* raised torch arm */}
        <path d={`M1126 ${G - 112} L1134 ${G - 150} L1139 ${G - 149} L1131 ${G - 110} Z`} />
        <rect x={1132} y={G - 158} width={8} height={8} rx={1} />
        <path d={`M1136 ${G - 172} q-6 8 0 14 q6 -6 0 -14 Z`} fill={C.flame} stroke="none" />
        {/* head + crown */}
        <circle cx={1122} cy={G - 123} r={7} />
        {[-60, -30, 0, 30, 60].map((a) => (
          <line
            key={a}
            x1={1122}
            y1={G - 129}
            x2={1122}
            y2={G - 138}
            transform={`rotate(${a} 1122 ${G - 125})`}
            strokeWidth={2}
            stroke={C.sea}
          />
        ))}
      </g>
      <text x={1126} y={G - 186} textAnchor="middle" fontSize={19} fill={C.ink} fontWeight={500}>
        New York
      </text>
    </g>
  );
}

function Cloud({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="white" stroke={C.grid} strokeWidth={1.2}>
      <path d="M0 20 Q0 8 12 8 Q16 -4 30 0 Q42 -6 48 8 Q60 8 60 20 Z" />
    </g>
  );
}

export function JourneyScene() {
  const ref = useRef<SVGSVGElement>(null);
  const [{ ms, total }, setClock] = useState({ ms: 0, total: 0 });

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setClock({ ms: 8600, total: 0 }));
      return () => cancelAnimationFrame(id);
    }
    let visible = false;
    const io = new IntersectionObserver(([e]) => {
      visible = Boolean(e?.isIntersecting);
    });
    if (ref.current) io.observe(ref.current);
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (visible && !document.hidden) {
        setClock((c) => ({ ms: (c.ms + dt) % LOOP, total: c.total + dt }));
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
    };
  }, []);

  const plane = planeAt(ms);
  const ahead = planeAt(Math.min(LOOP - 1, ms + 60));
  const angle =
    ahead.x === plane.x ? 0 : Math.max(-16, Math.min(16, (Math.atan2(ahead.dy - plane.dy, ahead.x - plane.x) * 180) / Math.PI));
  const gear = clamp01(1 + plane.dy / 30);
  const student = studentAt(ms);
  // Fade the actors out at the end of the loop and back in at the start.
  const fade = 1 - seg(ms, LOOP - 500, LOOP); // the plane enters off-screen, so only fade out
  const stairs = seg(ms, 6100, 6500);
  const doorOpen = Math.min(seg(ms, 8900, 9200), 1 - seg(ms, 10000, 10400));
  const cloudX = (base: number, speed: number) => ((base + (total / 1000) * speed) % 1400) - 100;

  return (
    <svg
      ref={ref}
      viewBox="0 40 1200 223"
      className="mx-auto block h-auto max-h-40 w-full sm:max-h-48"
      role="img"
      aria-label="Cartoon: a plane flies in and lands in New York, by the Statue of Liberty. A student steps off and walks into NYU."
    >
      <Cloud x={cloudX(80, 12)} y={70} s={0.9} />
      <Cloud x={cloudX(520, 8)} y={105} s={0.7} />
      <Cloud x={cloudX(960, 10)} y={62} s={0.8} />

      {/* flight path */}
      <path d={FLIGHT_PATH} fill="none" stroke={rust(45)} strokeWidth={1.5} strokeDasharray="4 7" />

      {/* ground + runway */}
      {/* No ground line: the SVG ends at G, right on the top edge of the grey How it works
          section, which acts as the ground. Runway is a strip just above it. */}
      <rect x={120} y={G - 5} width={640} height={5} fill="#dfe4e3" />
      <line x1={132} y1={G - 2.5} x2={748} y2={G - 2.5} stroke="white" strokeWidth={1.5} strokeDasharray="14 12" />

      <Nyu doorOpen={doorOpen} />
      <NewYork />

      <g opacity={fade}>
        <Plane x={plane.x} dy={plane.dy} angle={angle} gear={gear} />
        <Stairs top={[STAIRS.tx, G - 21]} bottom={[STAIRS.bx, G]} opacity={stairs} />
        <Student pose={student} ms={ms} />
      </g>
    </svg>
  );
}
