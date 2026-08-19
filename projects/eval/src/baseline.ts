// Baseline evaluation for comparison against qa.ts's mem-pipeline run: no store, no grouping,
// no retrieval -- the entire conv-30 conversation is pasted into context and the LLM answers
// each question directly, one at a time.
//
//   bun run projects/eval/src/baseline.ts
//
// Every answer call is logged with its token usage to a sibling .log file and priced the same
// way ingest.ts/qa.ts do, then written to out/baseline-<run-id>.report.md.
//
// Makes real, billed calls against the AI Gateway -- don't run casually.

import { generateText } from "ai"
import { appendFile, mkdir } from "node:fs/promises"
import { loadDataset, parseSessionDateTime, sessions } from "./dataset"
import { env } from "./env"
import { fetchPricing, readUsageByModel, totalCost } from "./usage"

void env // validated at import time (throws if AI_GATEWAY_API_KEY is missing)

const SAMPLE_ID = "conv-30"
const QUESTION_COUNT = 10
// Same model qa.ts uses for answer generation via mem's answer() flow -- reused here so the
// baseline and the mem-pipeline run are priced and compared on equal footing.
const ANSWER_MODEL = "openai/gpt-5-mini"

const DATASET_PATH = new URL("../data/locomo10.json", import.meta.url).pathname
const OUT_DIR = new URL("../out/", import.meta.url)
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-")
const LOG_PATH = new URL(`baseline-${RUN_ID}.log`, OUT_DIR).pathname

await mkdir(OUT_DIR, { recursive: true })

const samples = await loadDataset(DATASET_PATH)
const sample = samples.find((s) => s.sample_id === SAMPLE_ID)
if (!sample) throw new Error(`sample ${SAMPLE_ID} not found in ${DATASET_PATH}`)

// Every qa entry in this sample is "related to the conversation" by construction (LoCoMo scopes
// qa per-sample) -- take the first QUESTION_COUNT with a ground-truth `answer` in dataset order.
// This skips category-5 (adversarial) items, which carry `adversarial_answer` instead and have
// nothing to score a baseline text answer against.
const questions = sample.qa.filter((qa) => typeof qa.answer === "string" || typeof qa.answer === "number").slice(0, QUESTION_COUNT)
if (questions.length === 0) throw new Error(`no answerable questions found for ${SAMPLE_ID}`)

// Render the whole conversation, every session in order, as one flat transcript -- this is the
// baseline's entire "memory": no grouping, no retrieval, just the raw messages.
const transcript = sessions(sample)
  .flatMap((session) => {
    const date = parseSessionDateTime(session.dateTime)
    return session.turns.map((turn) => `- ${turn.speaker} (${date.toISOString()}): ${turn.text}`)
  })
  .join("\n")

async function answerBaseline(question: string): Promise<string> {
  try {
    const { text, usage } = await generateText({
      model: ANSWER_MODEL,
      system: [
        "You answer a question using only the conversation transcript given below, between two",
        "people. If the transcript doesn't establish an answer, say so plainly rather than",
        "guessing.",
      ].join(" "),
      prompt: `Conversation:\n${transcript}\n\nQuestion: ${question}`,
    })
    await appendFile(LOG_PATH, `${JSON.stringify({ msg: "external API call", action: "baselineAnswer", model: ANSWER_MODEL, usage })}\n`)
    return text
  } catch (err) {
    await appendFile(LOG_PATH, `${JSON.stringify({ msg: "external API call", action: "baselineAnswer", model: ANSWER_MODEL, failed: true })}\n`)
    throw err
  }
}

const lines: string[] = ["# Baseline report", "", `Sample: ${SAMPLE_ID}`, `Model: ${ANSWER_MODEL}`, `Transcript: ${transcript.split("\n").length} messages, ~${Math.round(transcript.length / 4)} tokens (rough estimate)`, ""]

for (const [i, qa] of questions.entries()) {
  console.error(`answering Q${i + 1}/${questions.length}...`)
  const text = await answerBaseline(qa.question)

  lines.push(`## Q${i + 1}: ${qa.question}`, "", `Answer: ${text}`, `Correct answer (dataset): ${qa.answer}`, "")
}

const byModel = await readUsageByModel(LOG_PATH)
const { pricing, error: pricingError } = await fetchPricing([...byModel.keys()])
const { total: cost, anyCost } = totalCost(byModel, pricing)

lines.push("### Usage & cost", "")
if (byModel.size === 0) {
  lines.push("(no usage log found -- nothing to report)")
} else {
  for (const [model, u] of byModel) {
    const price = pricing.get(model)
    const modelCost = price ? u.inputTokens * price.inputPerToken + u.outputTokens * price.outputPerToken : undefined
    lines.push(`- ${model}: ${u.calls} call(s), ${u.failed} failed, ${u.inputTokens} input tokens, ${u.outputTokens} output tokens, cost ${modelCost !== undefined ? `$${modelCost.toFixed(4)}` : "unknown"}`)
  }
  lines.push("", anyCost ? `**Total cost: $${cost.toFixed(4)}**` : `(total cost unavailable${pricingError ? ` -- ${pricingError}` : ""})`)
}

const REPORT_PATH = new URL(`baseline-${RUN_ID}.report.md`, OUT_DIR).pathname
await Bun.write(REPORT_PATH, lines.join("\n"))

console.log(`\nReport: ${REPORT_PATH}`)
console.log(`Usage log: ${LOG_PATH}`)
