"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, ImagePlus, Loader2, Lock, X } from "lucide-react";
import { cn } from "cn";
import { Button, buttonVariants } from "@prepora/ui/components/button";
import type { OcrWritingResponse } from "@prepora/shared/api/ocr-writing";
import { CostConfirm } from "@/components/credits/cost-confirm";
import { useCredits } from "@/components/credits/credits-provider";
import { planAllows } from "@/lib/reading";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";
import { ocrWriting } from "@/lib/writing/api";
import { MAX_PAGES, PhotoError, preparePhoto, uploadPhotos } from "@/lib/writing/photos";

type Page = { file: File; url: string };

/**
 * M6-F2: photograph a handwritten answer (up to 2 pages) → "Reading your handwriting" (ocr-writing,
 * 1 credit) → the text goes to the editor to check and edit, then it's scored like a typed answer
 * (input_mode "photo"). Photo upload is Gold/Platinum: Free sees what it does and an upgrade link.
 */
export function PhotoFlow({
  taskId,
  userId,
  onRead,
}: {
  taskId: string;
  userId: string;
  onRead: (result: OcrWritingResponse) => void;
}) {
  const { credits, run } = useCredits();
  const [pages, setPages] = useState<Page[]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const plan = credits?.plan ?? "free";

  // Free the preview URLs when pages are removed or the flow closes.
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  if (!planAllows(plan, "gold")) {
    return (
      <div className="flex flex-col gap-3 rounded-3xl border border-dashed border-foreground/15 bg-card p-6" data-testid="photo-locked">
        <p className="flex items-center gap-2 font-medium">
          <Lock className="size-4 text-muted-foreground" aria-hidden /> Photo upload is part of Gold
        </p>
        <p className="text-sm text-muted-foreground">
          Write on paper as in the exam, take a photo, and we&apos;ll turn your handwriting into text to score. You can type your answer on any plan.
        </p>
        <Link href={routes.upgrade} className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
          See Gold
        </Link>
      </div>
    );
  }

  function add(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const room = MAX_PAGES - pages.length;
    const next = [...list].slice(0, room).map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      return { file, url };
    });
    if (list.length > room) setError(`Up to ${MAX_PAGES} pages.`);
    setPages((p) => [...p, ...next]);
  }

  function remove(i: number) {
    setPages((p) => {
      URL.revokeObjectURL(p[i]!.url);
      return p.filter((_, j) => j !== i);
    });
  }

  async function read() {
    setReading(true);
    setError(null);
    try {
      const prepared = await Promise.all(pages.map((p) => preparePhoto(p.file)));
      const supabase = createClient();
      const paths = await uploadPhotos(supabase, userId, prepared);
      const result = await run(() => ocrWriting(supabase, { photo_paths: paths, task_id: taskId }, { mock: { plan, balance: credits?.balance } }));
      if (result.data) {
        onRead(result.data);
        return;
      }
      // Credit refusals open their own dialog (run); say something for the rest.
      if (!["insufficient_credits", "daily_cap_reached", "feature_not_in_plan"].includes(result.error.code)) {
        setError(`We couldn't read your photos: ${result.error.message} Your credit is refunded if it was spent; try again.`);
      }
    } catch (err) {
      setError(err instanceof PhotoError ? err.message : "Something went wrong with your photos. Try again.");
    } finally {
      setReading(false);
    }
  }

  if (reading) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-secondary p-10 text-center" role="status" data-testid="ocr-progress">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <p className="font-medium">Reading your handwriting…</p>
        <p className="text-sm text-muted-foreground">This takes a few seconds per page.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="photo-flow">
      <p className="text-sm text-muted-foreground">
        Photograph each page flat, in good light, with all the text in the frame. Up to {MAX_PAGES} pages. You&apos;ll check the text before it&apos;s scored.
      </p>
      {pages.length > 0 && (
        <ol className="grid grid-cols-2 gap-3 sm:max-w-md">
          {pages.map((p, i) => (
            <li key={p.url} className="relative overflow-hidden rounded-2xl border border-foreground/10 bg-muted">
              {/* Plain <img>: a local preview (blob: URL). HEIC previews only show in Safari. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Page ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
              <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium">Page {i + 1}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute right-2 top-2 rounded-full bg-background/90 p-1 hover:bg-background"
                aria-label={`Remove page ${i + 1}`}
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap gap-3">
        {pages.length < MAX_PAGES && (
          <>
            <Button variant="outline" onClick={() => camera.current?.click()}>
              <Camera /> Take a photo
            </Button>
            <Button variant="outline" onClick={() => files.current?.click()}>
              <ImagePlus /> Choose {pages.length ? "another page" : "photos"}
            </Button>
          </>
        )}
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-label="Take a photo"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={files}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose photos"
          data-testid="photo-input"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {pages.length > 0 && (
        <CostConfirm
          actionKey="ocr"
          description="Reading your handwriting (photo upload)"
          confirmLabel="Read my handwriting"
          onConfirm={() => void read()}
          trigger={<Button className="self-start">Read my handwriting</Button>}
        />
      )}
    </div>
  );
}
