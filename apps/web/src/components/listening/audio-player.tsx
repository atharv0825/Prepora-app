"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pause, Play, RotateCcw, Rewind, FastForward, Volume2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@prepora/ui/components/button";
import type { ListeningMode, ListeningSection } from "@prepora/shared/api/listening-test";
import {
  canPlaySection,
  clampSeek,
  EXAM_SECTION_GAP_SEC,
  examSeekCorrection,
  formatTime,
  type NetworkInfo,
  nextSection,
  playbackRules,
  preloadPlan,
  type SectionStatus,
  SKIP_SEC,
} from "@/lib/listening/player";

export type PlayerProgress = { section: number; statuses: Record<number, SectionStatus> };

/**
 * M5-F1: the Listening audio player (rules in lib/listening/player.ts).
 *
 * One <audio> element for every section: its source is swapped, so iOS Safari, which only lets
 * a page play audio after a tap, keeps allowing it when the next section starts by itself.
 * The next section is fetched ahead into memory (a blob URL) on slow or unknown networks.
 */
export function AudioPlayer({
  sections,
  mode,
  onProgress,
}: {
  sections: readonly ListeningSection[];
  mode: ListeningMode;
  onProgress?: (progress: PlayerProgress) => void;
}) {
  const rules = playbackRules(mode);
  const audio = useRef<HTMLAudioElement>(null);
  const ordered = useMemo(() => [...sections].sort((a, b) => a.order_no - b.order_no), [sections]);

  const [section, setSection] = useState(1);
  const [statuses, setStatuses] = useState<Record<number, SectionStatus>>({});
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number>(ordered[0]?.duration_sec ?? 0);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [volume, setVolume] = useState(1);

  // Preloaded sections: order_no → blob URL. Refs mirror state for event handlers.
  const [preloaded, setPreloaded] = useState<Record<number, string>>({});
  const preloadedRef = useRef<Record<number, string>>({});
  const preloading = useRef(new Set<number>());
  const stalled = useRef(false);
  const lastTime = useRef(0);
  const sectionRef = useRef(1);
  const statusesRef = useRef(statuses);
  const [plan, setPlan] = useState<"full" | "metadata" | null>(null);

  const setStatus = useCallback((n: number, s: SectionStatus) => {
    setStatuses((prev) => {
      const next = { ...prev, [n]: s };
      statusesRef.current = next;
      return next;
    });
  }, []);

  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  });
  useEffect(() => {
    onProgressRef.current?.({ section, statuses });
  }, [section, statuses]);

  const urlFor = useCallback(
    (n: number) => preloadedRef.current[n] ?? ordered.find((s) => s.order_no === n)?.audio_url ?? "",
    [ordered],
  );

  /** Fetch a section into memory when the network calls for it. */
  const preload = useCallback(
    async (n: number | null) => {
      if (n === null || preloadedRef.current[n] || preloading.current.has(n)) return;
      const connection = (navigator as Navigator & { connection?: NetworkInfo }).connection;
      const how = preloadPlan(connection, stalled.current);
      setPlan(how);
      if (how !== "full") return;
      const src = ordered.find((s) => s.order_no === n)?.audio_url;
      if (!src) return;
      preloading.current.add(n);
      try {
        const res = await fetch(src);
        if (!res.ok) return;
        const url = URL.createObjectURL(await res.blob());
        preloadedRef.current = { ...preloadedRef.current, [n]: url };
        setPreloaded(preloadedRef.current);
      } catch {
        // Not fatal: the section streams from its URL instead.
      } finally {
        preloading.current.delete(n);
      }
    },
    [ordered],
  );

  // The first section, before anyone presses play.
  useEffect(() => {
    void preload(1);
  }, [preload]);

  // Free the blobs when leaving the page.
  useEffect(
    () => () => {
      for (const url of Object.values(preloadedRef.current)) URL.revokeObjectURL(url);
    },
    [],
  );

  const start = useCallback(
    (n: number, from = 0) => {
      const el = audio.current;
      if (!el) return;
      sectionRef.current = n;
      setSection(n);
      setFailed(false);
      setCountdown(null);
      const src = urlFor(n);
      if (el.getAttribute("src") !== src) {
        el.src = src;
        setTime(0);
        setDuration(ordered.find((s) => s.order_no === n)?.duration_sec ?? 0);
      }
      lastTime.current = from;
      el.currentTime = from;
      setStatus(n, "playing");
      el.play().catch((err: unknown) => {
        // A pause or a new source before playback began (AbortError) is normal. Only a refusal
        // (NotAllowedError: no tap yet) or an unplayable file puts the play button back.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus(n, statusesRef.current[n] === "ended" ? "ended" : "not_started");
      });
      void preload(nextSection(n, ordered.length));
    },
    [ordered, preload, setStatus, urlFor],
  );

  // Exam: the gap between sections, then the next one starts by itself.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      const next = nextSection(sectionRef.current, ordered.length);
      if (next !== null) start(next);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, ordered.length, start]);

  // ── Element events ──────────────────────────────────────────────────────────────────────
  function onTimeUpdate() {
    const el = audio.current!;
    if (mode === "exam") {
      const back = examSeekCorrection(lastTime.current, el.currentTime);
      if (back !== null) {
        el.currentTime = back;
        return;
      }
    }
    lastTime.current = el.currentTime;
    setTime(el.currentTime);
  }

  function onPlaying() {
    setBuffering(false);
    // A jump made before the audio had loaded only takes effect now: put it back.
    onSeeking();
  }

  function onSeeking() {
    if (mode !== "exam") return;
    const el = audio.current!;
    const back = examSeekCorrection(lastTime.current, el.currentTime);
    if (back !== null) el.currentTime = back;
  }

  function onPause() {
    const el = audio.current!;
    const n = sectionRef.current;
    if (el.ended) return;
    if (mode === "exam" && statusesRef.current[n] === "playing") {
      // Media keys or the OS paused it: exam audio doesn't stop.
      el.play().catch(() => undefined);
      return;
    }
    if (statusesRef.current[n] === "playing") setStatus(n, "paused");
  }

  function onEnded() {
    const n = sectionRef.current;
    setStatus(n, "ended");
    setBuffering(false);
    if (rules.autoAdvance && nextSection(n, ordered.length) !== null) setCountdown(EXAM_SECTION_GAP_SEC);
  }

  function onWaiting() {
    stalled.current = true;
    setBuffering(true);
  }

  function onError() {
    setFailed(true);
    setBuffering(false);
  }

  // ── Controls ────────────────────────────────────────────────────────────────────────────
  const current = statuses[section] ?? "not_started";
  const playing = current === "playing";

  function togglePlay() {
    const el = audio.current!;
    if (playing) {
      if (rules.canPause) el.pause();
      return;
    }
    if (current === "paused") {
      setStatus(section, "playing");
      void el.play();
      return;
    }
    if (canPlaySection(mode, section, statuses)) start(section);
  }

  function seek(to: number) {
    if (!rules.canSeek) return;
    const el = audio.current!;
    el.currentTime = clampSeek(to, el.duration);
    lastTime.current = el.currentTime;
    setTime(el.currentTime);
  }

  function retry() {
    // Carry on from where it stopped (exam too: a dropped connection isn't the student's fault).
    const el = audio.current!;
    el.load();
    start(section, lastTime.current);
  }

  const total = duration;
  const pct = total > 0 ? Math.min(100, (time / total) * 100) : 0;
  const examDone = mode === "exam" && ordered.every((s) => statuses[s.order_no] === "ended");
  const canStartHere = canPlaySection(mode, section, statuses);
  const title = ordered.find((s) => s.order_no === section)?.title ?? `Part ${section}`;

  let note: string;
  if (failed) note = "The recording didn't load. Check your connection and try again.";
  else if (countdown !== null) note = `Part ${nextSection(section, ordered.length)} starts in ${countdown}s`;
  else if (examDone) note = "The recording has finished.";
  else if (mode === "exam" && current === "not_started") note = "Each part plays once, without pausing. Press play when you're ready.";
  else if (mode === "exam" && current === "ended") note = "This part has been played.";
  else if (buffering && playing) note = "Loading…";
  else note = `${formatTime(time)} / ${formatTime(total)}`;

  return (
    <section
      aria-label="Recording"
      data-testid="audio-player"
      data-mode={mode}
      data-section={section}
      data-status={current}
      data-preloaded={Object.keys(preloaded).sort().join(",")}
      data-preload-plan={plan ?? ""}
      className="flex flex-col gap-3 rounded-3xl border border-foreground/5 bg-card p-4 shadow-sm sm:p-5"
    >
      <audio
        ref={audio}
        preload={plan === "metadata" ? "metadata" : "auto"}
        onTimeUpdate={onTimeUpdate}
        onSeeking={onSeeking}
        onPause={onPause}
        onEnded={onEnded}
        onWaiting={onWaiting}
        onPlaying={onPlaying}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onError={onError}
        // No native controls: they'd allow seeking in exam mode.
        controls={false}
        className="hidden"
      />

      <div className="flex items-center gap-3">
        {failed ? (
          <Button size="icon" onClick={retry} aria-label="Try again">
            <RotateCcw />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={togglePlay}
            disabled={playing ? !rules.canPause : current !== "paused" && !canStartHere}
            aria-label={playing ? (rules.canPause ? "Pause" : "Playing") : "Play"}
          >
            {buffering && playing ? <Loader2 className="animate-spin" /> : playing ? <Pause /> : <Play />}
          </Button>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate font-medium">{title}</p>
            <span className="shrink-0 text-xs text-muted-foreground uppercase">{mode === "exam" ? "Exam mode" : "Practice mode"}</span>
          </div>
          {rules.canSeek ? (
            <input
              type="range"
              aria-label="Position"
              min={0}
              max={total || 0}
              step={0.1}
              value={Math.min(time, total || 0)}
              onChange={(e) => seek(Number(e.target.value))}
              className="w-full accent-primary"
            />
          ) : (
            <div
              role="progressbar"
              aria-label="Progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct)}
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
          )}
          <p className={cn("text-xs", failed ? "text-destructive" : "text-muted-foreground")} aria-live="polite" data-testid="player-note">
            {note}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {rules.canChooseSection && (
          <div role="group" aria-label="Parts" className="flex gap-1">
            {ordered.map((s) => (
              <Button
                key={s.id}
                size="sm"
                variant={s.order_no === section ? "default" : "outline"}
                aria-pressed={s.order_no === section}
                onClick={() => start(s.order_no)}
              >
                Part {s.order_no}
              </Button>
            ))}
          </div>
        )}
        {rules.canSeek && (
          <>
            <Button size="icon-sm" variant="ghost" aria-label={`Back ${SKIP_SEC} seconds`} onClick={() => seek(time - SKIP_SEC)}>
              <Rewind />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label={`Forward ${SKIP_SEC} seconds`} onClick={() => seek(time + SKIP_SEC)}>
              <FastForward />
            </Button>
          </>
        )}
        {rules.canReplay && (
          <Button size="sm" variant="ghost" onClick={() => start(section)}>
            <RotateCcw /> Replay part
          </Button>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Volume2 className="size-4" aria-hidden />
          <span className="sr-only">Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              if (audio.current) audio.current.volume = v;
            }}
            className="w-24 accent-primary"
          />
        </label>
      </div>
    </section>
  );
}
