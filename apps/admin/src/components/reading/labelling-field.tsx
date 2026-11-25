"use client";

import { useState } from "react";
import { ImageUp, X } from "lucide-react";
import { letterLabel } from "@prepora/shared/ielts/reading";
import { Button } from "@prepora/ui/components/button";
import { Input } from "@prepora/ui/components/input";
import { createClient } from "@/lib/supabase/client";
import type { Point, QuestionDraft } from "@/lib/reading-builder";

const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const IMAGE_MAX = 5 * 1024 * 1024;
const MAP_MAX = 12;

/**
 * The picture of a labelling question (Listening, M5-A1): upload it to the listening-images
 * bucket (M5-B3) or paste a URL, describe it for screen readers, then click the picture to place
 * points: a map's lettered places (A, B, C… in click order), or the diagram question's marker.
 * Points are % of the picture's size, so they stay put at any size. Questions on one picture
 * carry it over (and a map's places) from the previous question.
 */
export function LabellingField({
  testId,
  kind,
  draft,
  onChange,
  error,
  idPrefix,
}: {
  testId: string;
  kind: "map" | "diagram";
  draft: Pick<QuestionDraft, "image_url" | "image_alt" | "points" | "marker" | "label">;
  onChange: (patch: Partial<QuestionDraft>) => void;
  error?: string;
  idPrefix: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploadError(null);
    const ext = IMAGE_TYPES[file.type];
    if (!ext) return setUploadError("Use a PNG, JPEG or WebP image.");
    if (file.size > IMAGE_MAX) return setUploadError("Images can be 5 MB at most.");
    setUploading(true);
    const bucket = createClient().storage.from("listening-images");
    const path = `${testId}/${crypto.randomUUID()}.${ext}`;
    const { error: e } = await bucket.upload(path, file, { contentType: file.type });
    setUploading(false);
    if (e) return setUploadError(`Upload failed: ${e.message}`);
    onChange({ image_url: bucket.getPublicUrl(path).data.publicUrl });
  }

  function place(e: React.MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const p: Point = { x: ((e.clientX - box.left) / box.width) * 100, y: ((e.clientY - box.top) / box.height) * 100 };
    if (kind === "diagram") return onChange({ marker: p });
    if (draft.points.length < MAP_MAX) onChange({ points: [...draft.points, p] });
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-2xl border border-border p-4" data-testid="labelling-field">
      <legend className="px-1 text-sm font-medium">{kind === "map" ? "Map or plan" : "Diagram"}</legend>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:bg-secondary/50">
          <ImageUp className="size-4" aria-hidden />
          {uploading ? "Uploading…" : draft.image_url ? "Replace image" : "Upload image"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
            data-testid="image-upload"
          />
        </label>
        <span className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 5 MB.</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-url`} className="text-sm font-medium">
            Image URL
          </label>
          <Input id={`${idPrefix}-url`} value={draft.image_url} onChange={(e) => onChange({ image_url: e.target.value })} className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-alt`} className="text-sm font-medium">
            Description (for screen readers)
          </label>
          <Input
            id={`${idPrefix}-alt`}
            value={draft.image_alt}
            onChange={(e) => onChange({ image_alt: e.target.value })}
            maxLength={300}
            placeholder={kind === "map" ? "Plan of the sports centre" : "Diagram of a water filter"}
            className="h-10"
          />
        </div>
      </div>
      {(uploadError || error) && (
        <p role="alert" className="text-sm text-destructive">
          {uploadError ?? error}
        </p>
      )}

      {draft.image_url && (
        <>
          <p className="text-xs text-muted-foreground">
            {kind === "map"
              ? "Click the picture to add a lettered place (A, B, C… in order), up to 12. The answer is the letter of the place in the question."
              : "Click the picture where this question's number goes."}
          </p>
          <div className="relative w-full max-w-xl cursor-crosshair select-none overflow-hidden rounded-xl border border-border" onClick={place} data-testid="labelling-image">
            {/* eslint-disable-next-line @next/next/no-img-element -- any uploaded or pasted URL */}
            <img src={draft.image_url} alt={draft.image_alt} className="block w-full" draggable={false} />
            {kind === "map"
              ? draft.points.map((p, i) => <Dot key={i} p={p} text={letterLabel(i)} on={draft.label === letterLabel(i)} />)
              : draft.marker && <Dot p={draft.marker} text="?" on />}
          </div>
          {kind === "map" && draft.points.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Places">
              {draft.points.map((p, i) => (
                <li key={i} className="flex items-center gap-1 rounded-full border border-border py-0.5 pr-1 pl-3 text-sm">
                  {letterLabel(i)} <span className="text-xs text-muted-foreground">({Math.round(p.x)}%, {Math.round(p.y)}%)</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Remove place ${letterLabel(i)}`}
                    // Removing a place moves the later letters: clear the answer.
                    onClick={() => onChange({ points: draft.points.filter((_, j) => j !== i), label: "" })}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </fieldset>
  );
}

function Dot({ p, text, on }: { p: Point; text: string; on: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-xs font-bold shadow ${
        on ? "border-primary bg-primary text-primary-foreground" : "border-foreground/70 bg-white text-foreground"
      }`}
      style={{ left: `${p.x}%`, top: `${p.y}%` }}
    >
      {text}
    </span>
  );
}
