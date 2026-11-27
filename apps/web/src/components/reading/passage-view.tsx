"use client";

import { useEffect, useRef, useState } from "react";
import { Highlighter, Eraser } from "lucide-react";
import { Button } from "@prepora/ui/components/button";
import { PassageText } from "@prepora/ui/components/ielts/passage-text";
import { addHighlight, type Range, removeHighlightAt } from "@/lib/reading";

/**
 * A passage with highlighting (M4-F2), as in the computer-delivered test: select some text, press
 * Highlight (or Ctrl/⌘+H); tap a highlight to clear it. Highlights are character offsets into the
 * passage's plain text, so they survive a reload (saved with the draft).
 *
 * PassageText renders the body as one text block (white-space: pre-line) whose DOM text equals the
 * plain text (formatting marks removed), so an offset is just the length of the text before the
 * selection point.
 */
export function PassageView({
  title,
  body,
  highlights,
  onHighlightsChange,
}: {
  title: string;
  body: string;
  highlights: readonly Range[];
  onHighlightsChange: (ranges: Range[]) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<Range | null>(null);

  // Track a selection inside this passage.
  useEffect(() => {
    function onSelectionChange() {
      const el = bodyRef.current;
      const sel = document.getSelection();
      if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) return setPending(null);
      const range = sel.getRangeAt(0);
      if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return setPending(null);
      setPending([offsetIn(el, range.startContainer, range.startOffset), offsetIn(el, range.endContainer, range.endOffset)]);
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  function highlight() {
    if (!pending) return;
    onHighlightsChange(addHighlight(highlights, pending));
    document.getSelection()?.removeAllRanges();
    setPending(null);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h" && pending) {
      e.preventDefault();
      highlight();
    }
  }

  return (
    <article className="flex flex-col gap-4" aria-label={title} onKeyDown={onKeyDown}>
      {/* Pinned: on mobile under the header and the Passage / Questions switch; on desktop at the top of its pane. */}
      <div className="sticky top-[7.75rem] z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 bg-background/95 px-1 py-2 backdrop-blur md:top-0">
        <h2 className="text-h3">{title}</h2>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={pending ? "default" : "outline"}
            disabled={!pending}
            // Keep the text selected while pressing the button (touch especially).
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={highlight}
          >
            <Highlighter /> Highlight
          </Button>
          {highlights.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => onHighlightsChange([])}>
              <Eraser /> Clear
            </Button>
          )}
        </div>
      </div>
      <PassageText
        ref={bodyRef}
        body={body}
        highlights={highlights}
        onMarkClick={(start) => onHighlightsChange(removeHighlightAt(highlights, start))}
        data-testid="passage-body"
      />
    </article>
  );
}

/** Characters of `root`'s text before (node, offset). */
function offsetIn(root: Node, node: Node, offset: number): number {
  const r = document.createRange();
  r.setStart(root, 0);
  r.setEnd(node, offset);
  return r.toString().length;
}
