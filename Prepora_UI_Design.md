# Prepora: UI Design Description (Landing Page)

This page uses the same layout ideas as the reference shot, but in a clean **black and white** style instead of teal and lime.

---

## Overall style

- **Look:** Monochrome, editorial and calm. Black and white only, with greys for depth. No colour accents.
- **Two modes in one page:**
  - The hero section is **dark**.
  - The sections below it switch to **white**.
  - This high-contrast change replaces the reference's teal-to-white change.
- **Colour palette:**

| Token | Value | Use |
|---|---|---|
| `bg-dark` | `#0A0A0A` | Hero, footer, final call to action |
| `surface-dark` | `#141414` | Cards on black |
| `border-dark` | `#262626` | 1px borders on dark cards |
| `white` | `#FFFFFF` | Main light background, primary buttons |
| `bg-light` | `#F5F5F4` | Alternate light sections |
| `text-on-dark` | `#FFFFFF` | Headings and body text on dark |
| `text-on-dark-muted` | `#A3A3A3` | Secondary text on dark |
| `text-on-light` | `#0A0A0A` | Headings and body text on light |
| `text-on-light-muted` | `#525252` | Secondary text on light |

- **Fonts:**
  - Headings: *Hanken Grotesk*, light to regular weight, large, with tight letter spacing.
  - Body text: *Hanken Grotesk*, 16px.
  - Optional accent: *Instrument Serif* in italic, for a single emphasised phrase.
- **Shape:** Pill-shaped buttons, cards with 20–24px corner radius, thin 1px borders instead of heavy shadows.
- **Background texture:** A faint grid behind the hero (white lines at 4–6% opacity), so the black doesn't feel flat.

---

## 1. Navbar (on dark)

- **Left:** The **Prepora** wordmark in white, with a small monogram "P" in a white square.
- **Centre:** Home · Modules · How it works · Pricing · Contact.
  - Text is grey.
  - The active link is white, with a short 2px white underline.
- **Right:**
  - "Log in" as a text link.
  - **"Start free"** as a white pill button with black text.

---

## 2. Hero (dark, split 55/45)

### Left side

- **Eyebrow label:** "Your AI IELTS Coach", in a small outlined pill with a white dot.
- **Headline (64–72px, three lines):**
  > Practise smarter.
  > Score higher.
  > Reach *Band 8+*.
  - Emphasise **"Band 8+"** with *italic serif* type or a white underline stroke. Keep it white, not coloured.
- **Subtext (grey, about 2 lines):** "Speaking, Writing, Reading and Listening, with instant AI band scores and feedback on all 4 official criteria."
- **Buttons:**
  - Primary: white pill, "Start practising free →".
  - Secondary: outlined pill, "Try a speaking test".
- **Social proof row:** 3 overlapping round avatars, plus a dark circle showing "4.8 ★". Next to it: "Rated by 10,000+ learners".

### Right side

- A **phone mockup of the app** (a black-and-white photo of a student also works). Use a mockup rather than a stock person, because it shows the product.
- The phone screen shows the Speaking Part 2 cue card with a recording waveform.
- **Floating glass stat cards** around it:
  - Semi-transparent `#141414` at about 70% opacity, with background blur and a 1px border.
  - Each card has a thin-line icon, a small grey label and a bold white number.
  - Card 1: "Avg. band improvement · +1.0"
  - Card 2: "Mock tests · 500+"
  - Card 3: "Speaking sessions · 20,000+"
- Stagger the three cards at different heights to create depth.

---

## 3. Feature strip (white card overlapping the hero)

- A **white rounded panel** that overlaps the bottom edge of the dark hero.
- **Four columns,** each with a thin-line icon, a title and two lines of grey text:
  1. **AI Speaking Examiner:** Parts 1–3 with a voice examiner. The cue card has a 1-minute prep timer.
  2. **Writing Feedback:** type your answer, or upload a photo of handwritten work. Get criterion-wise band scores.
  3. **Real Test Format:** Reading and Listening tests with all question types, auto-scored.
  4. **Track Your Band:** a progress graph towards your target band and exam date.
- **Highlighted column:** make one column (for example AI Speaking) a **solid black card with white text** inside the white panel. It gives emphasis without colour.

---

## 4. Sections below (white background)

- **Modules grid:** 4 large cards in a 2×2 grid. Each shows a mini UI preview:
  - The waveform for Speaking
  - The essay editor for Writing
  - The passage and questions split view for Reading
  - The audio player for Listening
- **How it works:** 3 numbered steps in a horizontal row:
  1. Choose Academic or General
  2. Practise
  3. Get an instant band score and fixes
- **Sample feedback card:** A realistic result screen. It shows an overall band of 6.5 in large type, four criteria bars in black and grey, and a few highlighted corrections.
- **Pricing:**
  - **Free** card: white with a border.
  - **Platinum** card: solid black with white text, plus a "Most popular" pill.
- **Testimonials:** Simple quote cards with name and band achieved (for example "6.0 → 7.5").
- **Final call to action:** A full-width black band with a large white headline, "Your target band is closer than you think", and a white pill button.
- **Footer:** Black, with grey links, plus Privacy, Terms and the delete-account link (Play Store requires the last one).

---

## 5. Motion and detail

- Stat cards drift slightly on scroll (parallax).
- Buttons invert on hover:
  - The white pill turns black with a white border.
  - The outlined pill fills white.
- The hero grid fades out towards the bottom.
- Sections fade up gently as you scroll to them.
- Icons are all one thin-line set (Lucide or Phosphor Light) at 1.5px stroke.

---

## 6. Mobile app version

The same system carries into the Expo app:

- Dark mode by default, with a white light mode.
- Home screen:
  - A large greeting
  - A target band and exam countdown card
  - A 2×2 grid of module tiles, where the next recommended module is a white tile and the rest are dark
- Platinum features are marked with a small white outline badge, instead of using a colour.
