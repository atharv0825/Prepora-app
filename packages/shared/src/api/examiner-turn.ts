// examiner-turn contract (M8-C1): POST /functions/v1/examiner-turn, signed in. Implemented in M8-B1.
//
// Parts 1 and 3 are a conversation: the AI examiner asks a question (read aloud with the browser's
// voice, M8-F1), the student answers out loud, the answer is uploaded (speaking-audio, M7-C1), and
// the examiner picks the next question: the next one from the topic's set, or a short follow-up
// to what the student just said (Part 3 follows on from the Part 2 card's theme). This call costs
// no credits: the part's turns are included in its scoring price (speaking_p1 5, speaking_p3 6,
// scored by score-speaking at the end of the part, M8-B2).
//
// The request carries the conversation so far. Its NEWEST answer usually has only a recording:
// examiner-turn transcribes it (Gemini speech to text, M7-B1) and returns the transcript, so the client
// keeps the whole Q&A without a separate speech-to-text call. Older answers send their transcript.
// The first call of a part has no turns: it returns the opening question.
//
// Errors (the shared { error: { code, message, details } } shape):
//   400 validation_failed      malformed body; a recording outside the student's folder; turns out of order
//   401 unauthorized           no session
//   404 not_found              no such session (of this student) or published topic for this part
//   409 conflict               the session isn't at this part (state machine: ielts/speaking-session.ts)
//   500 internal               transcription or the AI failed (nothing charged: no credits here)
import { z } from "zod";
import { SpeakingAudioPath } from "./score-speaking";
import { QUESTIONS_PER_PART } from "../ielts/speaking-session";

const question = z.string().trim().min(1).max(300);

/** One question asked and its answer. The newest answer may still be a recording only. */
export const ExaminerTurnSchema = z
  .object({
    question,
    /** The recording of the answer (speaking-audio, the student's folder). */
    audio_path: SpeakingAudioPath.optional(),
    /** What was said; required for every answer except the newest. */
    transcript: z.string().max(5000).optional(),
    duration_sec: z.number().int().min(1).max(300).optional(),
  })
  .strict()
  .refine((t) => t.audio_path !== undefined || t.transcript !== undefined, { message: "An answer needs a recording or a transcript" });
export type ExaminerTurn = z.infer<typeof ExaminerTurnSchema>;

export const ExaminerTurnRequest = z
  .object({
    session_id: z.uuid(),
    /** Only Parts 1 and 3 have an examiner; Part 2 is the cue card (M7). */
    part: z.union([z.literal(1), z.literal(3)]),
    /** Part 1: a question set; Part 3: a discussion (linked to the session's Part 2 card). */
    topic_id: z.uuid(),
    turns: z.array(ExaminerTurnSchema).max(QUESTIONS_PER_PART[1].max),
  })
  .strict()
  .superRefine((r, ctx) => {
    const max = QUESTIONS_PER_PART[r.part].max;
    if (r.turns.length > max) ctx.addIssue({ code: "custom", path: ["turns"], message: `Part ${r.part} has at most ${max} questions` });
    // Every answer but the newest must already be transcribed (the function transcribes one per call).
    r.turns.slice(0, -1).forEach((t, i) => {
      if (t.transcript === undefined) ctx.addIssue({ code: "custom", path: ["turns", i, "transcript"], message: "Earlier answers need their transcript" });
    });
  });
export type ExaminerTurnRequest = z.infer<typeof ExaminerTurnRequest>;

export const ExaminerTurnResponse = z
  .object({
    /** The newest answer's transcript, when it was sent as a recording; else null. */
    transcribed: z.object({ index: z.number().int().min(0), transcript: z.string().max(5000) }).strict().nullable(),
    /** The question to ask now; null when the part is finished. */
    next_question: question.nullable(),
    /** "set": the next question from the topic; "follow_up": the examiner's own, on the last answer. */
    source: z.enum(["set", "follow_up"]).nullable(),
    /** 1-based number of next_question in the part; null when finished. */
    question_no: z.number().int().min(1).nullable(),
    /** True when the examiner has asked enough: score the part now (score-speaking, M8-B2). */
    done: z.boolean(),
  })
  .strict()
  .refine((r) => (r.done ? r.next_question === null && r.source === null && r.question_no === null : r.next_question !== null && r.source !== null && r.question_no !== null), {
    message: "A finished part has no next question; an open one has exactly one",
  });
export type ExaminerTurnResponse = z.infer<typeof ExaminerTurnResponse>;
