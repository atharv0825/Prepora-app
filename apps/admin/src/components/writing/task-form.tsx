"use client";

import { useActionState, useState } from "react";
import { ImageUp } from "lucide-react";
import { type WritingTaskKind, writingTaskKindLabels, writingTaskKinds } from "@prepora/shared/api/admin-writing";
import { Button } from "@prepora/ui/components/button";
import { Input } from "@prepora/ui/components/input";
import { toast } from "@prepora/ui/components/sonner";
import { Textarea } from "@prepora/ui/components/textarea";
import type { BuilderState } from "@/lib/builder-server";
import { createClient } from "@/lib/supabase/client";
import { createWritingTask, updateWritingTask } from "@/lib/writing-actions";
import { submitKeepingInput } from "../form-submit";
import { selectClass } from "../reading/status";

const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const IMAGE_MAX = 5 * 1024 * 1024;

export type TaskValues = {
  kind: WritingTaskKind;
  t2_test_type: "both" | "academic" | "general";
  title: string;
  prompt: string;
  image_url: string;
  image_alt: string;
};

const PLACEHOLDERS: Record<WritingTaskKind, string> = {
  t1_academic:
    "The chart below shows the percentage of households with internet access in three countries between 2000 and 2020.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.",
  t1_general:
    "You recently moved into a new flat. Your neighbour often plays loud music late at night.\n\nWrite a letter to your neighbour. In your letter:\n- introduce yourself\n- explain the problem\n- suggest a solution\n\nBegin your letter: Dear …",
  t2: "Some people believe that working from home benefits both employees and employers. Others think it causes more problems than it solves.\n\nDiscuss both views and give your own opinion.",
};

/**
 * M6-A1: a Writing task's details. The kind decides the rest: Task 2 can target both tests or one;
 * Task 1 Academic has its visual, uploaded to the public writing-images bucket (or a pasted URL)
 * with a description for screen readers. Without a task id it creates a draft and opens it.
 */
export function TaskForm({ taskId, values }: { taskId?: string; values?: TaskValues }) {
  const [kind, setKind] = useState<WritingTaskKind>(values?.kind ?? "t2");
  const [imageUrl, setImageUrl] = useState(values?.image_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(async (prev: BuilderState, form: FormData) => {
    const result = taskId ? await updateWritingTask(prev, form) : await createWritingTask(prev, form);
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
    return result;
  }, { ok: true, message: "" });
  const errors = state.fieldErrors ?? {};
  const id = (name: string) => `${taskId ?? "new"}-${name}`;

  async function upload(file: File) {
    setUploadError(null);
    const ext = IMAGE_TYPES[file.type];
    if (!ext) return setUploadError("Use a PNG, JPEG or WebP image.");
    if (file.size > IMAGE_MAX) return setUploadError("Images can be 5 MB at most.");
    setUploading(true);
    const bucket = createClient().storage.from("writing-images");
    const path = `${taskId ?? "new"}/${crypto.randomUUID()}.${ext}`;
    const { error } = await bucket.upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) return setUploadError(`Upload failed: ${error.message}`);
    setImageUrl(bucket.getPublicUrl(path).data.publicUrl);
  }

  return (
    <form onSubmit={submitKeepingInput(action)} className="flex flex-col gap-5" aria-label="Task details">
      {taskId && <input type="hidden" name="task_id" value={taskId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("kind")} className="text-sm font-medium">
            Task
          </label>
          <select id={id("kind")} name="kind" value={kind} onChange={(e) => setKind(e.target.value as WritingTaskKind)} className={selectClass}>
            {writingTaskKinds.map((k) => (
              <option key={k} value={k}>
                {writingTaskKindLabels[k]}
              </option>
            ))}
          </select>
        </div>
        {kind === "t2" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={id("t2type")} className="text-sm font-medium">
              For
            </label>
            <select id={id("t2type")} name="t2_test_type" defaultValue={values?.t2_test_type ?? "both"} className={selectClass}>
              <option value="both">Both tests (usual)</option>
              <option value="academic">Academic only</option>
              <option value="general">General Training only</option>
            </select>
          </div>
        ) : (
          <div />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("title")} className="text-sm font-medium">
          Title
        </label>
        <Input
          id={id("title")}
          name="title"
          required
          maxLength={200}
          defaultValue={values?.title}
          placeholder={kind === "t2" ? "Working from home" : kind === "t1_general" ? "Letter to a noisy neighbour" : "Internet access 2000–2020"}
          aria-invalid={errors.title ? true : undefined}
          className="h-11"
        />
        <span className="text-xs text-muted-foreground">Shown on the task list.</span>
        {errors.title && <span className="text-xs text-destructive">{errors.title}</span>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("prompt")} className="text-sm font-medium">
          The task, as students see it
        </label>
        <Textarea
          id={id("prompt")}
          name="prompt"
          required
          maxLength={4000}
          defaultValue={values?.prompt}
          placeholder={PLACEHOLDERS[kind]}
          aria-invalid={errors.prompt ? true : undefined}
          className="min-h-48"
        />
        <span className="text-xs text-muted-foreground">Line breaks are kept. The time and word limits are added automatically.</span>
        {errors.prompt && <span className="text-xs text-destructive">{errors.prompt}</span>}
      </div>

      {kind === "t1_academic" && (
        <fieldset className="flex flex-col gap-3 rounded-2xl border border-border p-4" data-testid="chart-field">
          <legend className="px-1 text-sm font-medium">Chart, graph, table, map or diagram</legend>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:bg-secondary/50">
              <ImageUp className="size-4" aria-hidden />
              {uploading ? "Uploading…" : imageUrl ? "Replace image" : "Upload image"}
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
            <span className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 5 MB. Required to publish.</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={id("url")} className="text-sm font-medium">
              Image URL
            </label>
            <Input id={id("url")} name="image_url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="h-10" aria-invalid={errors.image_url ? true : undefined} />
            {errors.image_url && <span className="text-xs text-destructive">{errors.image_url}</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={id("alt")} className="text-sm font-medium">
              Description (for screen readers)
            </label>
            <Input id={id("alt")} name="image_alt" maxLength={300} defaultValue={values?.image_alt} placeholder="Line graph of internet access in three countries, 2000–2020" className="h-10" />
          </div>
          {uploadError && (
            <p role="alert" className="text-sm text-destructive">
              {uploadError}
            </p>
          )}
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- any uploaded or pasted URL
            <img src={imageUrl} alt="The uploaded visual" className="max-h-80 w-auto max-w-full self-start rounded-xl border border-border bg-white" />
          )}
        </fieldset>
      )}

      <Button type="submit" disabled={pending || uploading} className="h-11 self-start">
        {pending ? "Saving…" : taskId ? "Save task" : "Create draft"}
      </Button>
    </form>
  );
}
