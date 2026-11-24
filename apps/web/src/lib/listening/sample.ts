// A sample Listening test (not production) for the M5-F1..F3 screens, until the Listening tables
// (M5-C1), builder (M5-A1) and grading (M5-B2) exist. It has the shape the real
// get_listening_test / grade-test will use (packages/shared/src/api/listening-test.ts).
//
// Server-side only: the answer keys and transcripts are here. The page sends samplePayload() to
// the browser (no keys, no transcripts); the grading action reads the rest.
import type { ListeningTestPayload, PublicListeningQuestion } from "@prepora/shared/api/listening-test";
import type { ListeningQuestionType } from "@prepora/shared/ielts/listening";

export const SAMPLE_TEST_ID = "5a3b0000-0000-4000-8000-000000000000";
const sectionId = (n: number) => `5a3b0000-0000-4000-8001-00000000000${n}`;
const questionId = (n: number) => `5a3b0000-0000-4000-8002-0000000000${String(n).padStart(2, "0")}`;

const svg = (body: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" font-family="sans-serif">${body}</svg>`)}`;

const MAP = svg(`
  <rect width="400" height="300" fill="#f4faf7"/>
  <path d="M0 140 H400 M200 0 V300" stroke="#d6e4df" stroke-width="18"/>
  <ellipse cx="300" cy="150" rx="34" ry="18" fill="#bfe3f2"/>
  <g fill="#ffffff" stroke="#9db8ae" stroke-width="2">
    <rect x="30" y="35" width="60" height="50"/><rect x="150" y="25" width="40" height="40"/>
    <rect x="270" y="35" width="70" height="40"/><rect x="45" y="150" width="70" height="40"/>
    <rect x="160" y="160" width="40" height="40"/><rect x="290" y="175" width="60" height="35"/>
    <rect x="50" y="235" width="80" height="45"/><rect x="290" y="250" width="44" height="26"/>
  </g>
  <text x="300" y="155" font-size="10" text-anchor="middle" fill="#37918a">Lake</text>
  <text x="200" y="296" font-size="11" text-anchor="middle" fill="#08222b">Main entrance</text>
  <text x="212" y="128" font-size="10" fill="#08222b">★ You are here</text>`);

const FILTER = svg(`
  <rect width="400" height="300" fill="#ffffff"/>
  <rect x="60" y="40" width="240" height="220" fill="none" stroke="#08222b" stroke-width="3"/>
  <rect x="62" y="42" width="236" height="48" fill="#cfe9f5"/>
  <rect x="62" y="90" width="236" height="90" fill="#f1e3b8"/>
  <rect x="62" y="180" width="236" height="50" fill="#c9c2b5"/>
  <rect x="62" y="230" width="236" height="28" fill="#e8eef0"/>
  <path d="M90 10 V40 M150 10 V40" stroke="#08222b" stroke-width="3"/>
  <path d="M86 30 H154" stroke="#08222b" stroke-width="2" stroke-dasharray="4 3"/>
  <path d="M300 245 H340 V250" stroke="#08222b" stroke-width="6" fill="none"/>
  <rect x="325" y="120" width="65" height="140" fill="#cfe9f5" stroke="#08222b" stroke-width="3"/>
  <text x="162" y="22" font-size="10">Raw water in</text>`);

type Key = { label: string } | { labels: string[] } | { accept: string[] };
type SampleQuestion = Omit<PublicListeningQuestion, "id" | "section_id"> & { answer: Key; explanation: string };

const q = (q_no: number, q_type: ListeningQuestionType, prompt: string, options: Record<string, unknown>, answer: Key, explanation: string): SampleQuestion => ({
  q_no,
  q_type,
  prompt,
  options,
  answer,
  explanation,
});

const oneWordOrNumber = { max_words: 1, number_allowed: true };
const mapOptions = {
  image_url: MAP,
  image_alt: "A campus map with eight lettered buildings, A to H, around a crossroads and a lake.",
  locations: [
    { label: "A", x: 15, y: 20 },
    { label: "B", x: 42, y: 15 },
    { label: "C", x: 76, y: 18 },
    { label: "D", x: 20, y: 57 },
    { label: "E", x: 45, y: 60 },
    { label: "F", x: 80, y: 64 },
    { label: "G", x: 22, y: 86 },
    { label: "H", x: 78, y: 88 },
  ],
};
const filter = (x: number, y: number) => ({
  image_url: FILTER,
  image_alt: "A cross-section of a slow sand filter: water on top, layers below, a pipe to a storage tank.",
  marker: { x, y },
  max_words: 1,
  number_allowed: false,
});
const who = { features: ["Maya", "Tom", "Both of them"], reuse: true };
const abc = (...choices: string[]) => ({ choices, select: 1 });

const QUESTIONS: SampleQuestion[] = [
  // Part 1: a booking form (note completion, ONE WORD AND/OR A NUMBER).
  q(1, "note_table_completion", "Name of group: ___ Walking Club", oneWordOrNumber, { accept: ["Hillside"] }, "“We’re the Hillside Walking Club.”"),
  q(2, "note_table_completion", "Number of people expected: ___", oneWordOrNumber, { accept: ["35", "thirty-five"] }, "First 30, then “make it 35 to be safe”."),
  q(3, "note_table_completion", "Day wanted: ___", oneWordOrNumber, { accept: ["Thursday"] }, "Tuesday is taken; they settle on Thursday."),
  q(4, "note_table_completion", "Room: the ___ Room", oneWordOrNumber, { accept: ["Garden"] }, "The Main Hall is too big, so the Garden Room."),
  q(5, "note_table_completion", "Start time: ___ pm", oneWordOrNumber, { accept: ["7.30", "7:30"] }, "Not seven: “half past seven”."),
  q(6, "note_table_completion", "Deposit: £___", oneWordOrNumber, { accept: ["50", "fifty"] }, "The deposit is £50; £120 is the full price."),
  q(7, "note_table_completion", "Equipment needed: a ___", oneWordOrNumber, { accept: ["projector"] }, "Chairs are already there; they need a projector."),
  q(8, "note_table_completion", "Parking: behind the ___", oneWordOrNumber, { accept: ["library"] }, "“The car park behind the library.”"),
  q(9, "note_table_completion", "Pay by: ___", oneWordOrNumber, { accept: ["cheque", "check"] }, "Cards aren’t accepted for deposits, so a cheque."),
  q(10, "note_table_completion", "Booking reference: ___", oneWordOrNumber, { accept: ["RC209"] }, "Spelled out: R, C, two, oh, nine."),
  // Part 2: a campus tour (map labelling, then multiple choice).
  q(11, "map_labelling", "Café", mapOptions, { label: "C" }, "“Opposite the library, on the corner by the lake path.”"),
  q(12, "map_labelling", "Library", mapOptions, { label: "A" }, "“The first building on your left as you go up the main road.”"),
  q(13, "map_labelling", "Sports hall", mapOptions, { label: "G" }, "“Just inside the main entrance, on the left.”"),
  q(14, "map_labelling", "Student union", mapOptions, { label: "E" }, "“Right beside the crossroads, the small square building.”"),
  q(15, "map_labelling", "Bus stop", mapOptions, { label: "H" }, "“By the entrance, on the right-hand side.”"),
  q(16, "mcq", "The campus tour lasts", abc("30 minutes", "45 minutes", "an hour"), { labels: ["B"] }, "“About forty-five minutes.”"),
  q(17, "mcq", "New students collect their ID card from", abc("the library", "reception", "the student union"), { labels: ["B"] }, "Not the union any more: reception."),
  q(18, "mcq", "The sports hall is free for students", abc("before 9 am", "at weekends", "on Wednesday afternoons"), { labels: ["C"] }, "“Free on Wednesday afternoons.”"),
  q(19, "mcq", "The guide recommends the café for its", abc("prices", "views", "opening hours"), { labels: ["A"] }, "“The cheapest coffee on campus.”"),
  q(20, "mcq", "Which TWO services are in the student union?", { choices: ["a bank", "a dentist", "a travel agent", "a print shop", "a pharmacy"], select: 2 }, { labels: ["A", "D"] }, "A bank and a print shop; the dentist moved out."),
  // Part 3: two students plan a project (matching, then multiple choice).
  q(21, "matching_features", "design the questionnaire", who, { label: "A" }, "Maya: “I’ll draft the questionnaire.”"),
  q(22, "matching_features", "contact the participants", who, { label: "B" }, "Tom has the club’s mailing list."),
  q(23, "matching_features", "analyse the data", who, { label: "C" }, "“Let’s do the analysis together.”"),
  q(24, "matching_features", "write the introduction", who, { label: "A" }, "Maya offers to write the introduction."),
  q(25, "matching_features", "prepare the slides", who, { label: "B" }, "Tom: “I’ll make the slides.”"),
  q(26, "mcq", "Why did they choose the topic?", abc("Their tutor suggested it", "Personal interest", "The data was easy to get"), { labels: ["B"] }, "Both play in a band: personal interest."),
  q(27, "mcq", "Their main problem so far is", abc("too few responses", "lost data", "lack of time"), { labels: ["A"] }, "“Only twelve replies.”"),
  q(28, "mcq", "The tutor said the literature review was", abc("too long", "too general", "out of date"), { labels: ["B"] }, "“Too general; focus it.”"),
  q(29, "mcq", "They will meet next on", abc("Monday", "Wednesday", "Friday"), { labels: ["C"] }, "Monday is a holiday; Friday."),
  q(30, "mcq", "The presentation will last", abc("10 minutes", "15 minutes", "20 minutes"), { labels: ["B"] }, "“Fifteen minutes, plus questions.”"),
  // Part 4: a lecture on slow sand filters (diagram labelling, then sentence completion).
  q(31, "diagram_labelling", "Leaves are removed by a ___", filter(30, 10), { accept: ["screen"] }, "“A coarse screen at the inlet.”"),
  q(32, "diagram_labelling", "Fine ___, about a metre deep", filter(45, 45), { accept: ["sand"] }, "The main layer is fine sand."),
  q(33, "diagram_labelling", "A layer of ___ supports it", filter(45, 68), { accept: ["gravel"] }, "“Gravel underneath holds the sand.”"),
  q(34, "diagram_labelling", "Clean water leaves through a ___", filter(80, 88), { accept: ["pipe"] }, "“Through a pipe at the bottom.”"),
  q(35, "diagram_labelling", "It is stored in a covered ___", filter(89, 52), { accept: ["tank"] }, "“A covered tank keeps it clean.”"),
  q(36, "sentence_completion", "The top of the sand is called the ___ layer.", { max_words: 1, number_allowed: false }, { accept: ["biological"] }, "“The biological layer, where the bacteria live.”"),
  q(37, "sentence_completion", "The filter works best when water moves ___.", { max_words: 1, number_allowed: false }, { accept: ["slowly"] }, "Speed reduces cleaning: slowly."),
  q(38, "sentence_completion", "The surface is cleaned every ___.", { max_words: 2, number_allowed: true }, { accept: ["two months", "2 months"] }, "“Every two months or so.”"),
  q(39, "sentence_completion", "The method was first used in ___.", { max_words: 1, number_allowed: false }, { accept: ["Scotland"] }, "Paisley, Scotland, in 1804."),
  q(40, "sentence_completion", "Villages like it because it needs no ___.", { max_words: 1, number_allowed: false }, { accept: ["electricity"] }, "“No pumps, no electricity.”"),
];

const SECTIONS = [
  {
    title: "Part 1: Booking a room",
    transcript:
      "Receptionist: Riverside Community Centre, how can I help? Caller: Hi, I'd like to book a room. We're the Hillside Walking Club. We'd expect about 30… actually make it 35 to be safe. Tuesday if possible. R: Tuesday's taken, I'm afraid. C: Then Thursday. R: The Main Hall is too big for you, so I'll put you in the Garden Room. What time? C: Seven… no, half past seven. R: The full price is £120, with a deposit of £50. Chairs are already in the room. C: We'll need a projector. And parking? R: Use the car park behind the library. Cards aren't accepted for deposits, so please pay by cheque. Your reference is R C two oh nine.",
  },
  {
    title: "Part 2: A campus tour",
    transcript:
      "Welcome to Westbrook. The tour takes about forty-five minutes. Just inside the main entrance, on the left, is the sports hall, which is free for students on Wednesday afternoons. By the entrance on the right-hand side is the bus stop. Walk up the main road: right beside the crossroads, the small square building, is the student union. It has a bank and a print shop; the dentist has moved out. The library is the first building on your left as you go up the main road, and opposite the library, on the corner by the lake path, is the café, with the cheapest coffee on campus. ID cards are no longer issued at the union: collect yours from reception.",
  },
  {
    title: "Part 3: Planning a project",
    transcript:
      "Tom: So, we chose music practice habits because we both play in a band. Maya: Right. I'll draft the questionnaire. Tom: And I'll contact the participants; I have the club's mailing list. Maya: Let's do the analysis together. I can write the introduction. Tom: Then I'll make the slides. The problem is we've only had twelve replies so far. Maya: And the tutor said our literature review is too general, we need to focus it. Tom: Shall we meet Monday? Maya: Monday's a holiday. Friday? Tom: Friday. The presentation is fifteen minutes, plus questions.",
  },
  {
    title: "Part 4: Slow sand filters",
    transcript:
      "Today: the slow sand filter. Raw water passes a coarse screen at the inlet, which removes leaves. It then sinks through fine sand, about a metre deep. Gravel underneath holds the sand in place. Clean water leaves through a pipe at the bottom and is stored in a covered tank, which keeps it clean. The top of the sand is called the biological layer, where the bacteria live. Speed reduces cleaning, so the water must move slowly. The surface is scraped every two months or so. The method was first used in Paisley, Scotland, in 1804, and many villages like it because it needs no pumps and no electricity.",
  },
];

export const SAMPLE_SECTION_COUNT = SECTIONS.length;

/** What the player receives: no answers, no explanations, no transcripts. `seconds` = audio length per part. */
export function samplePayload(seconds: number): ListeningTestPayload {
  return {
    test: { id: SAMPLE_TEST_ID, title: "Sample Listening test", min_plan: "free", status: "published" },
    sections: SECTIONS.map((s, i) => ({
      id: sectionId(i + 1),
      order_no: i + 1,
      title: s.title,
      audio_url: `/app/listening/sample/audio/${i + 1}?sec=${seconds}`,
      duration_sec: seconds,
    })),
    // Only the public fields: never the answer or explanation.
    questions: QUESTIONS.map((q) => ({
      id: questionId(q.q_no),
      section_id: sectionId(Math.ceil(q.q_no / 10)),
      q_no: q.q_no,
      q_type: q.q_type,
      prompt: q.prompt,
      options: q.options,
    })),
  };
}

/** The keys (grading action only). */
export function sampleKeys() {
  return QUESTIONS.map(({ q_no, q_type, options, answer, explanation }) => ({ q_no, q_type, options, answer, explanation }));
}

/** The transcripts, released with the results. */
export function sampleTranscripts() {
  return SECTIONS.map((s, i) => ({ order_no: i + 1, title: s.title, transcript: s.transcript }));
}

/** Audio length per part: 20 s by default, 1–120 s from ?sec= (short for the e2e tests). */
export function sampleSeconds(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) && n >= 1 && n <= 120 ? Math.round(n) : 20;
}
