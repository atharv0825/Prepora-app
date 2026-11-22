# Prepora: UI Design Description (Landing Page)

This page uses the same layout ideas as the reference shot, in a clean **white** style with **light-green components** and a **teal → mint palette**, with one green primary colour.

---

## Overall style

- **Look:** Editorial, fresh and calm. Pages are **white**; components that used to be black (highlighted cards, final call to action, footer) are **light green**. The only black is the **phone/laptop body** of the device showcase, so it reads as real hardware.
- **One mode for the whole page:** white sections, with light-green (*mint*) surfaces for emphasis. Emphasis comes from the green surface, not from a dark/light switch.
- **Colour palette:**

| Token | Value | Use |
|---|---|---|
| `brand-ink` | `#08222B` | Headings and body text, monogram square |
| `brand-deep` | `#0F3B47` | Deep teal (mobile dark mode surfaces) |
| `brand-teal` | `#1C5F66` | Muted text on mint, accent text on white (7.3 : 1) |
| `brand-sea` | `#37918A` | Icons, secondary accent, grid beams (3.8 : 1 on white: large text and icons only) |
| `brand-mint` | `#68C1A7` | Strong borders, inputs on mint |
| `brand-mist` | `#A7E6C9` | Borders on mint surfaces, device bezel |
| `brand-foam` | `#EAFAF0` | **Light-green component surfaces** (replaces black cards) |
| **`brand-primary`** | **`#3FC48C`** | **Primary colour:** primary buttons, highlights, progress lines, recording dot |
| `brand-logo` | `#0FA467` | Logo square and the "Prepora" wordmark (3.2 : 1, large text only) |
| `brand-rust` | `#8C3F3F` | Large italic serif emphasis (*Band 8+*, *closer*), the live module previews; also errors / destructive actions (7.2 : 1 on white) |
| `white` | `#FFFFFF` | Page background |
| `muted` | `#F5F5F4` | Alternate light sections (e.g. Pricing) |
| `grid-line` | `#E7EAEA` | Light-grey hero grid |

- **Using the colours:**
  - **Primary buttons** are `#3FC48C` with `#08222B` text (7.5 : 1). Never white text on the green (2.2 : 1, unreadable).
  - **Light-green components** (`mint` scheme): background `#EAFAF0`, 1px `#A7E6C9` border, `#08222B` text, `#1C5F66` secondary text. Cards inside a mint band are white.
  - **Large italic text** (the *Instrument Serif* emphasis phrases, e.g. *Band 8+*, *closer*) is solid **`#8C3F3F`** (brand-rust; 7.2 : 1 on white, 6.5 : 1 on `#EAFAF0`). No gradient.
  - **Small touches:** status dots and the "Most popular" pill use `#3FC48C`/teal.
  - **Text** is always `#08222B` (or `#1C5F66` / grey for secondary text), never green.

- **Fonts:**
  - Headings: *Hanken Grotesk*, light to regular weight, large, with tight letter spacing.
  - Body text: *Hanken Grotesk*, 16px.
  - Accent: *Instrument Serif* in italic, for a single emphasised phrase in large headings. It is solid `#8C3F3F` (see *Using the colours*).
- **Shape:** Pill-shaped buttons, cards with 20–24px corner radius, thin 1px borders instead of heavy shadows.
- **Background texture:** A light-grey grid (`#E7EAEA`) behind the white hero, with flowing green streaks (see §2 *Background*).

---

## 1. Navbar

- **Surface:** the navbar floats over the page and adapts to what's behind it:
  - **Top of the page:** fully transparent (no background, border or blur), so the hero runs right up under it.
  - **Scrolled:** light white glass (`white / 65%`) with blur and a faint bottom border.
  - Every page's first section leaves 4rem extra top space for it.

- **Left:** the logo icon (`apps/web/public/logo.png`: a white "P" on a rounded `#0FA467` square, 32px), then the **Prepora** wordmark in semibold logo green `#0FA467` (not black).
- **Centre:** Home · Modules · How it works · Pricing · Contact.
  - Inactive links are the text colour (`#08222B`) at 75% opacity; on hover they get a light-green (`#EAFAF0`) pill.
  - The **active** link is full `#08222B` and medium weight, on a light-green `#EAFAF0` pill with a short 2px `#3FC48C` underline.
  - On the landing page the active link **follows the scroll** (scroll-spy): Home at the top, then Modules, How it works, Pricing and Contact as each section reaches the navbar. Clicking a link scrolls there, so it becomes the selected one. On other pages it follows the URL. The mobile menu uses the same rule.
- **Right:**
  - "Log in" as a text link.
  - **"Start free"** as a green (`#3FC48C`) pill button with `#08222B` text.

---

## 2. Hero (white, split 55/45)

### Left side

- **No eyebrow label** (the "Your AI IELTS Coach" pill was removed); the headline is the first thing.
- **Headline (64–72px, three lines):**
  > Practise smarter.
  > Score higher.
  > Reach *Band 8+*.
  - Emphasise **"Band 8+"** with *italic serif* type in solid **`#8C3F3F`**.
- **Position (desktop):** the text block (headline, subtext, waitlist form) is **vertically centred** against the device, with equal space above (below the navbar) and below (above the feature strip). No "See how it works" link under the form.
- **Subtext (grey, about 2 lines):** "Speaking, Writing, Reading and Listening, with instant AI band scores and feedback on all 4 official criteria."
- **Buttons:**
  - Primary: green (`#3FC48C`) pill, "Start practising free →".
  - Secondary: outlined pill, "Try a speaking test".
- **Social proof row:** 3 overlapping round avatars, plus a light-green circle showing "4.8 ★". Next to it: "Rated by 10,000+ learners".

### Right side

- A **live device showcase**: a **black** phone/laptop body (`#0A0A0A`, `#262626` edge, black notch and a `#141414` laptop base) around a light-green screen (`#EAFAF0`, white cards inside, `#08222B` text), that plays short, self-running demos of all four modules (no video, built in HTML/CSS):
  1. **Speaking** on a **phone**: Part 2 cue card, recording timer counting up, live waveform, pulsing `#3FC48C` "Recording…" dot, green mic button, then a band card (7.0 with FC / LR / GRA / P).
  2. The frame **morphs into a laptop** (smooth width/height/corner transition, laptop base slides in) for **Writing**: the essay types itself, word count climbs, timer counts down, then a score panel slides in (overall 6.5 + criteria bars).
  3. **Reading** on the laptop: split view; the passage is highlighted in `#3FC48C` as it's read, True / False / Not Given answers are picked one by one, then "3 / 3 correct".
  4. Back to the **phone** for **Listening**: audio progress bar runs while the form answers (surname, phone, day, deposit) are written in.
  - Loops every ~7.5 s per module. No tabs under the device (removed); it plays on its own.
  - Pauses on hover/focus, when scrolled out of view or the browser tab is hidden. With reduced motion it doesn't auto-play and shows each demo's finished state.
  - The laptop screen is laid out at a fixed size and scaled to fit, so it looks the same on phones and desktops.
- **No stat cards** under the device (removed), so the feature strip sits closer to the hero.

### Background

- **White** background with a **light-grey grid** (`#E7EAEA`, 56px cells) that **flows**: thin streaks travel along the grid lines (green `#3FC48C` along rows, sea `#37918A` down columns), and a few grid squares softly light up and fade in mist `#A7E6C9` / mint `#68C1A7`. Everything fades out towards the bottom with the grid. Decorative only; stops with reduced motion.

---

## 3. Feature strip (white card overlapping the hero)

- A **white rounded panel** that overlaps the bottom edge of the hero.
- **Four columns,** each with a thin-line icon, a title and two lines of grey text:
  1. **AI Speaking Examiner:** Parts 1–3 with a voice examiner. The cue card has a 1-minute prep timer.
  2. **Writing Feedback:** type your answer, or upload a photo of handwritten work. Get criterion-wise band scores.
  3. **Real Test Format:** Reading and Listening tests with all question types, auto-scored.
  4. **Track Your Band:** a progress graph towards your target band and exam date.
- **Highlighted column:** one column (AI Speaking) is a **light-green card** (`#EAFAF0`, `#08222B` text, teal icon) inside the white panel.

---

## 4. Sections below (white background)

- **Modules grid:** 4 large cards in a 2×2 grid. Each shows a **live** mini UI preview in **brand-rust `#8C3F3F`** (8 s loop; only runs while on screen; static with reduced motion):
  - **Speaking:** pulsing recording dot, timer counting up, moving waveform bars.
  - **Writing:** essay lines fill in one after another with a blinking caret, word count climbs, timer counts down.
  - **Reading:** a highlight sweeps down the passage, then "Not Given" gets picked.
  - **Listening:** brown play/pause button (white icon), progress bar fills, time ticks; brief pause at the end of each loop.
- **Journey film (bottom of the Modules section, in the white gap before How it works):** a cartoon SVG film drawn **straight on the page** (no card, border or sky; transparent background), about 160–190px tall, 15 s loop with drifting clouds. It sits a small gap (16–24px) under the module cards and **stands on the top edge of the grey How it works section**: that edge is the ground (no ground line, no space below); the runway is a thin strip just above it, and the city labels sit above the landmarks:
  - **No departure city:** the plane simply flies in from the left, already in the air.
  - **New York (right):** an **NYU** building (warm brick tint, NYU-violet `#57068C` flags on the roof and a violet "NYU" banner over the door), then the **Statue of Liberty** (sea-green, gold torch flame) in front of a skyline with the **Empire State Building**, label "New York" above the torch.
  - **Story (13 s loop):** the plane (white, green tail, rust stripe) flies in along a dashed rust path, makes a long gentle descent (nose down at most ~16°), lowers its gear and lands on the runway → stairs come out → the student (green top, rust suitcase) steps out, walks down and across to NYU → the door opens and the student goes in.
  - Runs only while on screen; reduced motion shows the student walking to NYU. Has an `aria-label` describing the story.
- **How it works:** 3 numbered steps in a horizontal row:
  1. Choose Academic or General
  2. Practise
  3. Get an instant band score and fixes
- **Sample feedback card:** A realistic result screen. It shows an overall band of 6.5 in large type, four criteria bars in `#08222B` and grey, and a few highlighted corrections.
- **Pricing:**
  - **Free** card: white with a border.
  - **Platinum** card: light green (`#EAFAF0`) with a `#A7E6C9` border, a green primary button and a "Most popular" pill (green outline, faint green fill).
- **Testimonials:** Simple quote cards with name and band achieved (for example "6.0 → 7.5").
- **Final call to action:** A full-width **light-green** band (`#EAFAF0`) with the light-grey grid, a large `#08222B` headline, "Your target band is *closer* than you think", where *closer* is italic serif in `#8C3F3F`, and a green pill button.
- **Footer:** Light green (`#EAFAF0`) with teal (`#1C5F66`) links, plus Privacy, Terms and the delete-account link (Play Store requires the last one).

---

## 5. Motion and detail

- Buttons invert on hover:
  - The green pill turns white with a `#08222B` border.
  - The outlined pill fills green.
- The hero grid fades out towards the bottom.
- Sections fade up gently as you scroll to them.
- Icons are all one thin-line set (Lucide or Phosphor Light) at 1.5px stroke.

---

## 6. Mobile app version

The same system carries into the Expo app:

- Light (white + mint) by default, with a deep-teal dark mode (`#08222B` background, `#0F3B47` cards, `#3FC48C` primary).
- Home screen:
  - A large greeting
  - A target band and exam countdown card
  - A 2×2 grid of module tiles, where the next recommended module is a green (`#3FC48C`) tile and the rest are light green
- Platinum features are marked with a small badge with a green `#3FC48C` outline.
