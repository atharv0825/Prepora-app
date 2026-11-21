import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Instrument_Serif } from "next/font/google";
import { Toaster } from "@prepora/ui/components/sonner";
import "@prepora/ui/globals.css";

// Fonts: Hanken Grotesk for headings and body (variable, 100–900, with italics),
// Instrument Serif italic for the single accent phrase (Prepora_UI_Design.md).
// next/font self-hosts them at build time: no request to Google at runtime, no layout shift.
// The CSS variables are consumed by packages/ui/src/styles/globals.css.
const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken-grotesk",
  style: ["normal", "italic"],
  display: "swap",
});
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  weight: "400",
  style: "italic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Prepora — IELTS practice with AI feedback",
  description:
    "Practise IELTS Speaking, Writing, Reading and Listening with instant AI band scores.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets bottom sheets respect the iPhone home-indicator safe area
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${hankenGrotesk.variable} ${instrumentSerif.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
