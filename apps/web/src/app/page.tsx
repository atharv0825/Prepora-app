import { Button } from "@/components/ui/button";

// M0-F1 placeholder. Replaced by the real landing page + waitlist in M0-F4.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
        Coming soon
      </p>
      <h1 className="max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">Prepora</h1>
      <p className="max-w-md text-lg text-muted-foreground">
        IELTS Speaking, Writing, Reading and Listening practice with instant AI band scores.
      </p>
      <Button size="lg" disabled>
        Join the waitlist
      </Button>
    </main>
  );
}
