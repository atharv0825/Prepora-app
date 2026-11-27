// A practice page's header: title and description on the left, the completion bar on the right,
// and an optional control (the test-type dropdown) centred in the space between them (stacked on
// phones).
export function PracticeHeader({
  title,
  children,
  progress,
  controls,
}: {
  title: string;
  children: React.ReactNode;
  progress: React.ReactNode;
  controls?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-h1">{title}</h1>
        <div className="text-muted-foreground">{children}</div>
      </div>
      {/* The space between the text and the bar, with the control in its middle. Inline styles, so a
          stale dev stylesheet can't drop the centring. */}
      {controls && <div style={{ display: "flex", flex: "1 1 0%", justifyContent: "center", minWidth: 0 }}>{controls}</div>}
      <div className="shrink-0">{progress}</div>
    </div>
  );
}
