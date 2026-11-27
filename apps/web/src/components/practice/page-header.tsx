// A practice page's header: title and description on the left, the completion bar on the right
// (stacked on phones).
export function PracticeHeader({ title, children, progress }: { title: string; children: React.ReactNode; progress: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-h1">{title}</h1>
        <div className="text-muted-foreground">{children}</div>
      </div>
      <div className="shrink-0">{progress}</div>
    </div>
  );
}
