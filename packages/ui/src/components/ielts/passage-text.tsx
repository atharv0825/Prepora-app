import { Fragment, type ReactNode } from "react";
import { cn } from "cn";
import { parsePassage, type PassagePiece, passagePieces } from "@prepora/shared/ielts/passage-text";

/**
 * A Reading passage body as students see it (M4-A1 format: paragraphs, ## headings, **bold**,
 * *italic*), shared by the test player and the admin builder's preview. Rendered as text inside
 * one pre-line block, so the element's text equals the passage's plain text and highlight offsets
 * (M4-F2) are plain character offsets. Nothing is ever rendered as HTML.
 */
export function PassageText({
  body,
  highlights = [],
  onMarkClick,
  className,
  ref,
  ...rest
}: {
  body: string;
  highlights?: readonly (readonly [number, number])[];
  /** A highlight was clicked: its start offset. */
  onMarkClick?: (start: number) => void;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children">) {
  const pieces = passagePieces(parsePassage(body).runs, highlights);
  return (
    <div ref={ref} className={cn("leading-relaxed whitespace-pre-line", className)} {...rest}>
      {pieces.map((p) =>
        p.marked ? (
          <mark
            key={p.start}
            data-start={p.start}
            title="Tap to remove the highlight"
            onClick={onMarkClick ? () => onMarkClick(p.start) : undefined}
            className="cursor-pointer rounded-sm bg-amber-200/80 text-inherit"
          >
            {styled(p)}
          </mark>
        ) : (
          <Fragment key={p.start}>{styled(p)}</Fragment>
        ),
      )}
    </div>
  );
}

function styled(p: PassagePiece): ReactNode {
  let node: ReactNode = p.text;
  if (p.italic) node = <em>{node}</em>;
  if (p.bold) node = <strong className="font-semibold">{node}</strong>;
  if (p.heading) node = <span className="text-[1.1em] font-semibold">{node}</span>;
  return node;
}
