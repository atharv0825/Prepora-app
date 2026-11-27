"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Smartphone } from "lucide-react";
import qrcode from "qrcode-generator";

/** The page's origin on the client (empty while server-rendering, so the QR appears after hydration). */
function useOrigin(): string {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
}

/** A QR code as an SVG of dark modules, from the library's module grid (no HTML injected). */
function QrSvg({ value, label }: { value: string; label: string }) {
  const cells = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    const dark: string[] = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) dark.push(`M${c + 4} ${r + 4}h1v1h-1z`);
    return { size: n + 8, path: dark.join("") };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${cells.size} ${cells.size}`} role="img" aria-label={label} className="size-36 shrink-0 rounded-xl bg-white" shapeRendering="crispEdges">
      <path d={cells.path} fill="#08222B" />
    </svg>
  );
}

/**
 * M6-F2 on desktop: "Scan with your phone" opens this task's photo upload on the phone (signed in
 * as the same student). The phone does the whole photo flow and can submit from there. Hidden on
 * small screens, where the student already holds the camera.
 */
export function PhoneQr({ path }: { path: string }) {
  const origin = useOrigin();
  if (!origin) return null;
  const url = `${origin}${path}`;
  return (
    <div className="hidden items-center gap-5 rounded-3xl border border-foreground/5 bg-card p-5 md:flex" data-testid="phone-qr">
      <QrSvg value={url} label="QR code that opens this task's photo upload on your phone" />
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 font-medium">
          <Smartphone className="size-4" aria-hidden /> Scan with your phone
        </p>
        <p className="text-sm text-muted-foreground">
          Take the photos with your phone camera: this opens the upload for this task there. Sign in with the same account, then
          check the text and get your score on the phone.
        </p>
      </div>
    </div>
  );
}
