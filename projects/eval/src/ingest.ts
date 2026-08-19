// Tags conv-30 session by session and stores the result in a fresh sqlite database, using
// mem's gpt-5-mini tagger. Each session is one tagging chunk; the tag vocabulary discovered by
// earlier sessions is carried into later ones so the tagger reuses tags instead of minting
// near-duplicates.
//
//   bun run projects/eval/src/ingest.ts
//
// Every tagger call is logged with its token usage to a sibling .log file (same ndjson shape
// usage.ts reads) and priced the same way baseline.ts is.
//
// Makes real, billed calls against the AI Gateway -- don't run casually.

import { appendFile, mkdir } from "node:fs/promises"
import { mem } from "@memtree.wiki/mem"
import { createStore, type store } from "@memtree.wiki/store"
import { loadDataset, parseSessionDateTime, sessions } from "./dataset"
import { env } from "./env"
import { fetchPricing, readUsageByModel, totalCost } from "./usage"

void env // validated at import time (throws if AI_GATEWAY_API_KEY is missing)

const SAMPLE_ID = "conv-30"

const DATASET_PATH = new URL("../data/locomo10.json", import.meta.url).pathname
const OUT_DIR = new URL("../out/", import.meta.url)
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-")
const LOG_PATH = new URL(`ingest-${SAMPLE_ID}-${RUN_ID}.log`, OUT_DIR).pathname
const DB_PATH = new URL(`${SAMPLE_ID}-${RUN_ID}.db`, OUT_DIR).pathname

await mkdir(OUT_DIR, { recursive: true })

const samples = await loadDataset(DATASET_PATH)
const sample = samples.find((s) => s.sample_id === SAMPLE_ID)
if (!sample) throw new Error(`sample ${SAMPLE_ID} not found in ${DATASET_PATH}`)

const tag = mem.createTagger((info) => appendFile(LOG_PATH, `${JSON.stringify({ msg: "external API call", action: "tagMessages", ...info })}\n`))

const db = await createStore(DB_PATH)

const allSessions = sessions(sample)
let existingTags: string[] = []

for (const session of allSessions) {
  const date = parseSessionDateTime(session.dateTime)
  const msgs: store.Msg[] = session.turns.map((turn) => ({ date, speaker: turn.speaker, text: turn.text }))

  console.error(`session ${session.index}/${allSessions.length}: tagging ${msgs.length} messages...`)
  const tagged = await tag({ msgs, existingTags })
  await db.addMessages(tagged)

  for (const taggedMsg of tagged) {
    for (const name of taggedMsg.tags) {
      if (!existingTags.includes(name)) existingTags.push(name)
    }
  }
}

const byModel = await readUsageByModel(LOG_PATH)
const { pricing, error: pricingError } = await fetchPricing([...byModel.keys()])
const { total: cost, anyCost } = totalCost(byModel, pricing)

console.log(`\nDB: ${DB_PATH}`)
console.log(`Log: ${LOG_PATH}`)
console.log(`Tags discovered (${existingTags.length}): ${existingTags.join(", ")}`)

if (byModel.size === 0) {
  console.log("(no usage log found -- nothing to report)")
} else {
  for (const [model, u] of byModel) {
    const price = pricing.get(model)
    const modelCost = price ? u.inputTokens * price.inputPerToken + u.outputTokens * price.outputPerToken : undefined
    console.log(`- ${model}: ${u.calls} call(s), ${u.failed} failed, ${u.inputTokens} input tokens, ${u.outputTokens} output tokens, cost ${modelCost !== undefined ? `$${modelCost.toFixed(4)}` : "unknown"}`)
  }
  console.log(anyCost ? `Total cost: $${cost.toFixed(4)}` : `(total cost unavailable${pricingError ? ` -- ${pricingError}` : ""})`)
}
