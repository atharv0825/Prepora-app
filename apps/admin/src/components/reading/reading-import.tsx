"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ClipboardPaste, FileUp, ImageOff, TriangleAlert, X } from "lucide-react";
import { MAX_QUESTIONS } from "@prepora/shared/api/admin-reading";
import { parseReadingQuestion, readingQuestionTypeLabels, readingQuestionTypes, type ReadingQuestionType } from "@prepora/shared/ielts/reading";
import { Badge } from "@prepora/ui/components/badge";
import { Button } from "@prepora/ui/components/button";
import { Input } from "@prepora/ui/components/input";
import { toast } from "@prepora/ui/components/sonner";
import { Textarea } from "@prepora/ui/components/textarea";
import { contentFromDraft } from "@/lib/reading-builder";
import { extractDraftText, importReadingContent } from "@/lib/reading-import-actions";
import {
  draftFromImported,
  type ImportedPassage,
  type ImportedQuestion,
  type ImportWarning,
  judgementLabel,
  judgementValue,
  parseReadingDraft,
} from "@/lib/reading-import";
import { selectClass } from "./status";

// Reading builder import (Paste content / Upload document) → preview → Import. An extra way to
// fill the same passages and questions as the manual forms, which stay as they are. Nothing is
// saved until "Import": every item is checked live with the shared contract, and again on the
// server, which saves everything in one transaction.

const OPEN_EVENT = "reading-import:open";
type OpenDetail = { method: "paste" | "upload"; passage?: number };

/** The two buttons shown next to "Add question" / "Add passage"; they open the import panel. */
export function ImportButtons({ passage }: { passage?: number }) {
  const open = (method: OpenDetail["method"]) => window.dispatchEvent(new CustomEvent<OpenDetail>(OPEN_EVENT, { detail: { method, passage } }));
  return (
    <>
      <Button type="button" variant="outline" onClick={() => open("paste")}>
        <ClipboardPaste /> Paste content
      </Button>
      <Button type="button" variant="outline" onClick={() => open("upload")}>
        <FileUp /> Upload document
      </Button>
    </>
  );
}

const ANSWER_HINT: Record<ReadingQuestionType, string> = {
  mcq: "Letter(s), e.g. B or B, D",
  tfng: "True, False or Not Given",
  ynng: "Yes, No or Not Given",
  matching_headings: "Heading numeral, e.g. iv",
  matching_information: "Paragraph letter, e.g. C",
  matching_features: "Letter from the list, e.g. A",
  sentence_completion: "Accepted answers, separated by /",
  summary_completion: "Answer (letter if a word list is used)",
  note_table_completion: "Accepted answers, separated by /",
  flowchart_completion: "Answer (letter if a word list is used)",
  short_answer: "Accepted answers, separated by /",
};

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

type Props = {
  testId: string;
  testType: "academic" | "general";
  existingQuestions: number;
  existingPassages: number[];
};

export function ReadingImport({ testId, testType, existingQuestions, existingPassages }: Props) {
  const [open, setOpen] = useState<OpenDetail | null>(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);
  const [passages, setPassages] = useState<ImportedPassage[] | null>(null);
  /** Draft passage number → the slot (1–3) it's saved to. */
  const [slots, setSlots] = useState<Record<number, number>>({});
  const [items, setItems] = useState<ImportedQuestion[]>([]);
  const [mode, setMode] = useState<"append" | "replace" | null>(existingQuestions ? null : "append");
  const [pending, start] = useTransition();
  const panel = useRef<HTMLElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenDetail>).detail;
      setOpen(detail);
      requestAnimationFrame(() => {
        panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (detail.method === "upload") fileInput.current?.click();
      });
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  function reset() {
    setPassages(null);
    setItems([]);
    setWarnings([]);
    setSlots({});
  }

  function preview(source = text) {
    const result = parseReadingDraft(source, { testType });
    setWarnings(result.warnings);
    setPassages(result.passages);
    // A single passage (or questions only) goes where the button said, else where the draft says.
    const target = open?.passage;
    const single = result.passages.length <= 1 && target;
    setSlots(Object.fromEntries(result.passages.map((p) => [p.order_no, single ? target : Math.min(3, Math.max(1, p.order_no))])));
    setItems(result.questions.map((q) => (single && !result.passages.length ? { ...q, passage: target } : q)));
  }

  function upload(file: File) {
    const form = new FormData();
    form.set("file", file);
    start(async () => {
      const result = await extractDraftText(form);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setFileName(result.name);
      setText(result.text);
      preview(result.text);
    });
  }

  // Live checks: each question through the builder's conversion and the shared contract.
  const checked = useMemo(
    () =>
      items.map((item) => {
        if (!item.q_type) return { item, error: "Choose the question type." };
        const parsed = parseReadingQuestion(contentFromDraft(draftFromImported(item)));
        return { item, error: parsed.success ? null : (parsed.error.issues[0]?.message ?? "Invalid") };
      }),
    [items],
  );
  const slotOf = (draftPassage: number) => slots[draftPassage] ?? Math.min(3, Math.max(1, draftPassage));
  const problems = checked.filter((c) => c.error).length;
  const usedSlots = passages?.map((p) => slotOf(p.order_no)) ?? [];
  const duplicateSlot = new Set(usedSlots).size !== usedSlots.length;
  const missingPassage = items.some((q) => !usedSlots.includes(slotOf(q.passage)) && !existingPassages.includes(slotOf(q.passage)));
  const total = (mode === "replace" ? 0 : existingQuestions) + items.length;
  const blocked = !passages || problems > 0 || duplicateSlot || missingPassage || total > MAX_QUESTIONS || !mode || (!items.length && !passages.length);

  function update(number: number, patch: Partial<ImportedQuestion>) {
    setItems((all) => all.map((q) => (q.number === number ? { ...q, ...patch } : q)));
  }
  function updatePassage(order: number, patch: Partial<ImportedPassage>) {
    setPassages((all) => all?.map((p) => (p.order_no === order ? { ...p, ...patch } : p)) ?? null);
  }

  function save() {
    if (!passages || !mode) return;
    start(async () => {
      const result = await importReadingContent({
        test_id: testId,
        mode,
        passages: passages.map((p) => ({ order_no: slotOf(p.order_no), title: p.title, body: p.body })),
        questions: items.map((q) => {
          const content = contentFromDraft(draftFromImported(q));
          return { passage_order_no: slotOf(q.passage), number: q.number, ...content, explanation: q.explanation || null };
        }),
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      reset();
      setText("");
      setFileName(null);
      setOpen(null);
    });
  }

  const byType = readingQuestionTypes
    .map((t) => ({ type: t as ReadingQuestionType | null, list: checked.filter((c) => c.item.q_type === t) }))
    .concat([{ type: null, list: checked.filter((c) => !c.item.q_type) }])
    .filter((g) => g.list.length);

  return (
    <section ref={panel} aria-labelledby="import-heading" className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6" data-testid="reading-import">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="import-heading" className="text-lg font-semibold">
            Import from a draft
          </h2>
          <p className="text-sm text-muted-foreground">
            Paste a draft or upload a document (.txt, .md, .docx, .pdf), check the preview, then import. The forms below still work as before.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ImportButtons passage={open?.passage} />
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".txt,.md,.markdown,.docx,.pdf"
        className="sr-only"
        aria-label="Upload document"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            setOpen((o) => o ?? { method: "upload" });
            upload(file);
          }
          e.target.value = "";
        }}
      />

      {open && (
        <div className="flex flex-col gap-3">
          <label htmlFor="import-text" className="text-sm font-medium">
            {fileName ? `Text from ${fileName}` : "Draft content"}
            {open.passage ? <span className="font-normal text-muted-foreground"> · for passage {open.passage} unless the draft says otherwise</span> : null}
          </label>
          <Textarea
            id="import-text"
            rows={12}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              reset();
            }}
            placeholder={"Passage 1: Title\nA. First paragraph…\n\nQuestions 1–5\nChoose the correct letter, A, B, C or D.\n1. …\n\nAnswer key\n| Q | Answer |\n| 1 | B |"}
            className="max-h-[50vh] font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => preview()} disabled={!text.trim() || pending}>
              Preview
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(null);
                reset();
                setText("");
                setFileName(null);
              }}
            >
              <X /> Close
            </Button>
          </div>
        </div>
      )}

      {open && passages && (
        <div className="flex flex-col gap-6 border-t border-border pt-4" data-testid="import-preview">
          <p className="text-sm" data-testid="import-summary">
            Found <strong>{passages.length}</strong> passage{passages.length === 1 ? "" : "s"} and <strong>{items.length}</strong> question
            {items.length === 1 ? "" : "s"}.{" "}
            {problems ? <span className="text-destructive">{problems} need fixing before import.</span> : "Everything checks out."}
          </p>

          {warnings.length > 0 && (
            <ul className="flex flex-col gap-1.5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900" aria-label="Warnings" data-testid="import-warnings">
              {warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {w.message}
                </li>
              ))}
            </ul>
          )}

          {passages.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold">Passages</h3>
              <ul className="flex flex-col gap-3">
                {passages.map((p) => {
                  const slot = slotOf(p.order_no);
                  const exists = existingPassages.includes(slot);
                  return (
                    <li key={p.order_no} className="flex flex-col gap-2 rounded-2xl border border-border p-3" data-testid="import-passage">
                      <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
                        <select
                          aria-label={`Save "${p.title}" as passage`}
                          className={selectClass}
                          value={slot}
                          onChange={(e) => setSlots((s) => ({ ...s, [p.order_no]: Number(e.target.value) }))}
                        >
                          {[1, 2, 3].map((n) => (
                            <option key={n} value={n}>
                              Passage {n}
                            </option>
                          ))}
                        </select>
                        <Input aria-label="Passage title" value={p.title} onChange={(e) => updatePassage(p.order_no, { title: e.target.value })} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.paragraphCount} paragraph{p.paragraphCount === 1 ? "" : "s"}
                        {p.letters.length ? ` (${p.letters.join(", ")})` : ""} · {p.wordCount} words
                        {exists && (
                          <span className="text-amber-700">
                            {" "}
                            · Passage {slot} already exists: {mode === "replace" ? "its text will be replaced" : "its text is kept; the questions are added to it"}.
                          </span>
                        )}
                      </p>
                      <details>
                        <summary className="cursor-pointer text-xs text-muted-foreground">Show or edit the text</summary>
                        <Textarea
                          aria-label={`Passage ${slot} text`}
                          rows={8}
                          value={p.body}
                          onChange={(e) => updatePassage(p.order_no, { body: e.target.value })}
                          className="mt-2 font-mono text-xs"
                        />
                      </details>
                    </li>
                  );
                })}
              </ul>
              {duplicateSlot && <p className="text-sm text-destructive">Two passages go to the same place: choose a different passage number for one.</p>}
            </div>
          )}

          {items.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="font-semibold">Questions</h3>
              {byType.map((g) => (
                <section key={g.type ?? "unknown"} aria-label={g.type ? readingQuestionTypeLabels[g.type] : "Unknown type"} className="flex flex-col gap-2">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {g.type ? readingQuestionTypeLabels[g.type] : "Type not recognised"} · {g.list.length}
                  </h4>
                  <ol className="flex flex-col gap-2">
                    {g.list.map(({ item, error }) => (
                      <QuestionRow key={item.number} item={item} error={error} onChange={(patch) => update(item.number, patch)} />
                    ))}
                  </ol>
                </section>
              ))}
              {missingPassage && <p className="text-sm text-destructive">Some questions belong to a passage that isn&apos;t in the test or the import.</p>}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            {existingQuestions > 0 && (
              <fieldset className="flex flex-col gap-2 text-sm">
                <legend className="mb-1 font-medium">This test already has {existingQuestions} questions. What should the import do?</legend>
                <label className="flex items-start gap-2">
                  <input type="radio" name="import-mode" checked={mode === "append"} onChange={() => setMode("append")} />
                  <span>
                    <strong>Append</strong>: keep the existing passages and questions; add the imported ones after them.
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="radio" name="import-mode" checked={mode === "replace"} onChange={() => setMode("replace")} />
                  <span>
                    <strong>Replace</strong>: delete the test&apos;s questions and replace the text of the imported passages.
                  </span>
                </label>
              </fieldset>
            )}
            {total > MAX_QUESTIONS && (
              <p className="text-sm text-destructive">
                That makes {total} questions; a test has {MAX_QUESTIONS} at most.
              </p>
            )}
            <div>
              <Button type="button" onClick={save} disabled={blocked || pending}>
                {pending ? "Importing…" : `Import ${items.length} question${items.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function QuestionRow({ item, error, onChange }: { item: ImportedQuestion; error: string | null; onChange: (patch: Partial<ImportedQuestion>) => void }) {
  const t = item.q_type;
  const listName = t === "matching_headings" ? "Headings (one per line)" : t === "matching_features" ? "List (one per line)" : "Word list (one per line)";
  const showList = t === "matching_headings" || t === "matching_features" || ((t === "summary_completion" || t === "flowchart_completion") && item.bank);
  const typed = t && ["sentence_completion", "note_table_completion", "short_answer"].includes(t) || ((t === "summary_completion" || t === "flowchart_completion") && !item.bank);
  const judged = t === "tfng" || t === "ynng" ? judgementValue(item.answer, t) : null;
  const id = `import-q${item.number}`;

  return (
    <li className={`flex flex-col gap-2 rounded-2xl border p-3 ${error ? "border-destructive/50" : "border-border"}`} data-testid="import-question" data-q={item.number}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">{item.number}</span>
        <select
          aria-label={`Question ${item.number} type`}
          className={`${selectClass} h-9 w-auto`}
          value={t ?? ""}
          onChange={(e) => onChange({ q_type: (e.target.value || null) as ReadingQuestionType | null })}
        >
          {!t && <option value="">Choose a type…</option>}
          {readingQuestionTypes.map((type) => (
            <option key={type} value={type}>
              {readingQuestionTypeLabels[type]}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">Passage {item.passage}</span>
        {item.needs_image && (
          <Badge variant="outline" className="gap-1 text-amber-800">
            <ImageOff className="size-3" aria-hidden /> Needs image
          </Badge>
        )}
      </div>
      <Textarea id={`${id}-prompt`} aria-label={`Question ${item.number} text`} rows={2} value={item.prompt} onChange={(e) => onChange({ prompt: e.target.value })} className="text-sm" />
      {t === "mcq" && (
        <Textarea
          aria-label={`Question ${item.number} choices (one per line)`}
          rows={Math.max(2, item.choices.length)}
          value={item.choices.join("\n")}
          onChange={(e) => onChange({ choices: lines(e.target.value) })}
          className="text-sm"
        />
      )}
      {showList && (
        <Textarea aria-label={`Question ${item.number} ${listName}`} rows={Math.min(8, Math.max(2, item.list.length))} value={item.list.join("\n")} onChange={(e) => onChange({ list: lines(e.target.value) })} className="text-sm" />
      )}
      {t === "matching_information" && (
        <Input aria-label={`Question ${item.number} paragraph letters`} value={item.paragraphs.join(" ")} onChange={(e) => onChange({ paragraphs: e.target.value.toUpperCase().match(/[A-Z]/g) ?? [] })} />
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          aria-label={`Question ${item.number} answer`}
          placeholder={t ? ANSWER_HINT[t] : "Answer"}
          value={judged ? judgementLabel(judged) : item.answer}
          onChange={(e) => onChange({ answer: e.target.value })}
        />
        {typed && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Max words
            <Input
              type="number"
              min={1}
              max={5}
              className="h-9 w-16"
              aria-label={`Question ${item.number} word limit`}
              value={item.max_words}
              onChange={(e) => onChange({ max_words: Number(e.target.value) || 1 })}
            />
            <input type="checkbox" checked={item.number_allowed} onChange={(e) => onChange({ number_allowed: e.target.checked })} aria-label={`Question ${item.number}: a number may be added`} />
            + number
          </label>
        )}
      </div>
      <Input aria-label={`Question ${item.number} explanation`} placeholder="Explanation (optional)" value={item.explanation} onChange={(e) => onChange({ explanation: e.target.value })} />
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
