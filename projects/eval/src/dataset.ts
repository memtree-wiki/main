import { z } from "zod"

// One line of dialogue. LoCoMo turns can carry an attached image (img_url/blip_caption),
// which the adapter ignores for now — only `text` feeds the memtree pipeline.
export const Turn = z.object({
  speaker: z.string(),
  dia_id: z.string(),
  text: z.string(),
  img_url: z.array(z.string()).optional(),
  blip_caption: z.string().optional(),
})
export type Turn = z.infer<typeof Turn>

export const QA = z.object({
  question: z.string(),
  category: z.number(),
  // Absent on category 5 (adversarial) items, which carry `adversarial_answer` instead — a
  // plausible-but-wrong answer used to check whether a system hallucinates rather than
  // recognizing the question is unanswerable from the conversation.
  answer: z.union([z.string(), z.number()]).optional(),
  adversarial_answer: z.string().optional(),
  evidence: z.array(z.string()).optional(),
})
export type QA = z.infer<typeof QA>

// Sessions live as dynamically-numbered `session_N` / `session_N_date_time` keys rather than
// an array, so the schema only pins down the two speaker names and leaves the rest loose;
// `sessions()` below does the numbered-key extraction.
const Conversation = z.looseObject({
  speaker_a: z.string(),
  speaker_b: z.string(),
})

export const Sample = z.object({
  sample_id: z.string(),
  qa: z.array(QA),
  conversation: Conversation,
})
export type Sample = z.infer<typeof Sample>

export const Dataset = z.array(Sample)

export async function loadDataset(path: string): Promise<Sample[]> {
  return Dataset.parse(await Bun.file(path).json())
}

export interface Session {
  index: number
  dateTime: string | undefined
  turns: Turn[]
}

// LoCoMo's dateTime strings read "<time> on <date>" (e.g. "1:56 pm on 8 May, 2023"), which
// native Date parsing rejects outright -- reorder to "<date> <time>" first. Falls back to now
// when dateTime is absent (a known dataset gap, see sessions() below) or unparseable.
export function parseSessionDateTime(dateTime: string | undefined): Date {
  const match = dateTime?.match(/^(.+?) on (.+)$/)
  if (!match) return new Date()
  const [, time, date] = match
  const parsed = new Date(`${date} ${time}`)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

// The released dataset has stray `session_N_date_time` keys with no matching `session_N`
// array (a known artifact of the source data) — sessions() only returns numbers that have
// both, sorted in conversation order.
export function sessions({ conversation }: Sample): Session[] {
  const indices = Object.keys(conversation)
    .map((key) => key.match(/^session_(\d+)$/)?.[1])
    .filter((n) => n !== undefined)
    .map(Number)
    .filter((index) => conversation[`session_${index}`] !== undefined)
    .sort((a, b) => a - b)

  return indices.map((index) => ({
    index,
    dateTime: conversation[`session_${index}_date_time`] as string | undefined,
    turns: z.array(Turn).parse(conversation[`session_${index}`]),
  }))
}
