"use client";

import { useActionState, useRef, useState } from "react";
import { Bold, Eye, Heading2, Italic, PencilLine } from "lucide-react";
import { PASSAGE_MAX, passageFormatHelp, sanitizePassage } from "@prepora/shared/ielts/passage-text";
import { Button } from "@prepora/ui/components/button";
import { Input } from "@prepora/ui/components/input";
import { PassageText } from "@prepora/ui/components/ielts/passage-text";
import { toast } from "@prepora/ui/components/sonner";
import { Textarea } from "@prepora/ui/components/textarea";
import { type BuilderState, saveReadingPassage } from "@/lib/reading-actions";
import { submitKeepingInput } from "../form-submit";

/**
 * One passage (M4-A1): title and text. The text uses the passage format (blank line between
 * paragraphs, ## heading, **bold**, *italic*): the toolbar inserts the marks around the
 * selection, and Preview shows it exactly as students will (the same component as the player).
 */
export function PassageEditor({
  testId,
  orderNo,
  passage,
  extraActions,
}: {
  testId: string;
  orderNo: number;
  passage?: { title: string; body: string };
  /** Shown next to "Add passage N" (the import buttons). */
  extraActions?: React.ReactNode;
}) {
  const [body, setBody] = useState(passage?.body ?? "");
  const [preview, setPreview] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const [state, action, pending] = useActionState(async (prev: BuilderState, form: FormData) => {
    const result = await saveReadingPassage(prev, form);
    if (result.ok) {
      toast.success(result.message);
      setBody(sanitizePassage(String(form.get("body") ?? "")));
    } else toast.error(result.message);
    return result;
  }, { ok: true, message: "" });
  const errors = state.fieldErrors ?? {};
  const id = (name: string) => `p${orderNo}-${name}`;

  /** Wrap the selection in marks (or prefix its line, for a heading). */
  function mark(kind: "bold" | "italic" | "heading") {
    const el = area.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    let next: string;
    let caret: [number, number];
    if (kind === "heading") {
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const has = value.startsWith("## ", lineStart);
      next = has ? value.slice(0, lineStart) + value.slice(lineStart + 3) : value.slice(0, lineStart) + "## " + value.slice(lineStart);
      const shift = has ? -3 : 3;
      caret = [s + shift, e + shift];
    } else {
      const m = kind === "bold" ? "**" : "*";
      const text = value.slice(s, e) || (kind === "bold" ? "bold text" : "italic text");
      next = value.slice(0, s) + m + text + m + value.slice(e);
      caret = [s + m.length, s + m.length + text.length];
    }
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(...caret);
    });
  }

  return (
    <form onSubmit={submitKeepingInput(action)} className="flex flex-col gap-4" aria-label={`Passage ${orderNo}`}>
      <input type="hidden" name="test_id" value={testId} />
      <input type="hidden" name="order_no" value={orderNo} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("title")} className="text-sm font-medium">
          Passage {orderNo} title
        </label>
        <Input
          id={id("title")}
          name="title"
          required
          maxLength={200}
          defaultValue={passage?.title}
          aria-invalid={errors.title ? true : undefined}
          className="h-11"
        />
        {errors.title && <span className="text-xs text-destructive">{errors.title}</span>}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <label htmlFor={id("body")} className="text-sm font-medium">
            Text
          </label>
          <div className="flex gap-1" role="toolbar" aria-label="Formatting">
            <Button type="button" size="sm" variant="ghost" disabled={preview} onClick={() => mark("heading")} aria-label="Heading">
              <Heading2 />
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={preview} onClick={() => mark("bold")} aria-label="Bold">
              <Bold />
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={preview} onClick={() => mark("italic")} aria-label="Italic">
              <Italic />
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
              {preview ? <PencilLine /> : <Eye />} {preview ? "Edit" : "Preview"}
            </Button>
          </div>
        </div>
        {/* The textarea stays mounted (hidden in preview) so its value is always submitted. */}
        <Textarea
          ref={area}
          id={id("body")}
          name="body"
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={PASSAGE_MAX}
          rows={14}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={id("help")}
          className={preview ? "hidden" : "max-h-[60vh] font-mono text-sm"}
        />
        {preview && (
          <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-border p-4" data-testid={`passage-${orderNo}-preview`}>
            {body.trim() ? <PassageText body={sanitizePassage(body)} /> : <p className="text-muted-foreground">Nothing to preview yet.</p>}
          </div>
        )}
        <div id={id("help")} className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span className={errors.body ? "text-destructive" : undefined}>{errors.body ?? passageFormatHelp.join(" ")}</span>
          <span className="tabular-nums">
            {body.length.toLocaleString("en")} / {PASSAGE_MAX.toLocaleString("en")}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : passage ? `Save passage ${orderNo}` : `Add passage ${orderNo}`}
        </Button>
        {!passage && extraActions}
      </div>
    </form>
  );
}
