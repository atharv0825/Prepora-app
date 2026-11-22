const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const commit = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "dev";

export function Version({ className }: { className?: string }) {
  return (
    <p className={className} title={`Version ${version}, commit ${commit}`}>
      <span className="font-mono">
        v{version} · {commit}
      </span>
    </p>
  );
}
