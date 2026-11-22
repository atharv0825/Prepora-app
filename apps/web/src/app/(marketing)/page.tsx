import type { Metadata } from "next";
import { FeatureStrip } from "@/components/landing/feature-strip";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ModulesGrid } from "@/components/landing/modules-grid";
import { Pricing } from "@/components/landing/pricing";
import { SampleFeedback } from "@/components/landing/sample-feedback";

// M0-F4 landing page + waitlist. Layout follows Prepora_UI_Design.md. Testimonials are left out
// until real beta users can give them.
export const metadata: Metadata = {
  title: "Prepora — Your AI IELTS coach",
  description:
    "Practise IELTS Speaking, Writing, Reading and Listening with instant AI band scores and feedback on all 4 official criteria. Join the free beta waitlist.",
  openGraph: {
    title: "Prepora — Your AI IELTS coach",
    description:
      "Instant AI band scores for IELTS Speaking, Writing, Reading and Listening. Join the free beta.",
    type: "website",
  },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <FeatureStrip />
      <ModulesGrid />
      <HowItWorks />
      <SampleFeedback />
      <Pricing />
      <FinalCta />
    </>
  );
}
