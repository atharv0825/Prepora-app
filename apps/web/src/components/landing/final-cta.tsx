import { WaitlistForm } from "../waitlist/waitlist-form";

/** Full-width black band with the main waitlist form (design doc §4). Also the "Contact" anchor. */
export function FinalCta() {
  return (
    <section id="waitlist" className="dark relative scroll-mt-16 overflow-hidden">
      <span id="contact" className="absolute -top-16" aria-hidden />
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 rotate-180" />
      <div className="container-page relative flex flex-col items-center gap-8 py-24 text-center sm:py-32">
        <h2 className="max-w-3xl text-display">
          Your target band is <span className="text-accent-serif">closer</span> than you think.
        </h2>
        <p className="max-w-xl text-lead text-muted-foreground">
          Join the waitlist for the free beta. We&apos;re opening in India, Nepal, Bangladesh and
          Sri Lanka first.
        </p>
        <WaitlistForm location="final_cta" className="mx-auto [&_p]:text-center" />
      </div>
    </section>
  );
}
