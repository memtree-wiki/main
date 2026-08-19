// Shared usage/pricing helpers for reading the pino ndjson log ingest.ts writes for every
// "external API call" (group + embed calls alike) and pricing it against the AI Gateway.
// Used by both ingest.ts (printed live, right after ingestion) and analyze.ts (read back from
// a log file next to an existing db).

export interface ModelUsage {
  calls: number
  failed: number
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheReadTokens: number
}

export function emptyUsage(): ModelUsage {
  return { calls: 0, failed: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0 }
}

/** Parses the pino ndjson log for every "external API call" line, summed per model. Returns an empty map if the log is missing. */
export async function readUsageByModel(logPath: string): Promise<Map<string, ModelUsage>> {
  const byModel = new Map<string, ModelUsage>()
  if (!(await Bun.file(logPath).exists())) return byModel

  for (const line of (await Bun.file(logPath).text()).split("\n")) {
    if (!line.trim()) continue
    const parsed = JSON.parse(line)
    if (parsed.msg !== "external API call" || !parsed.model || !parsed.usage) continue

    const usage = byModel.get(parsed.model) ?? emptyUsage()
    usage.calls += 1
    if (parsed.failed) usage.failed += 1
    usage.inputTokens += parsed.usage.inputTokens ?? 0
    usage.outputTokens += parsed.usage.outputTokens ?? 0
    usage.reasoningTokens += parsed.usage.outputTokenDetails?.reasoningTokens ?? 0
    usage.cacheReadTokens += parsed.usage.inputTokenDetails?.cacheReadTokens ?? 0
    byModel.set(parsed.model, usage)
  }

  return byModel
}

export interface Pricing {
  inputPerToken: number
  outputPerToken: number
}

/** One metadata lookup against the AI Gateway (not a generation call) for current per-token pricing of every model given. Returns an empty map -- callers fall back to reporting tokens without a cost -- when AI_GATEWAY_API_KEY isn't set or the lookup fails. */
export async function fetchPricing(modelIds: string[]): Promise<{ pricing: Map<string, Pricing>; error?: string }> {
  const pricing = new Map<string, Pricing>()
  if (modelIds.length === 0) return { pricing }
  if (!process.env.AI_GATEWAY_API_KEY) return { pricing, error: "AI_GATEWAY_API_KEY not set" }

  try {
    const { createGateway } = await import("ai")
    const { models } = await createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY }).getAvailableModels()
    for (const id of modelIds) {
      const entry = models.find((m) => m.id === id)
      if (entry?.pricing) pricing.set(id, { inputPerToken: Number(entry.pricing.input), outputPerToken: Number(entry.pricing.output) })
    }
    return { pricing }
  } catch (err) {
    return { pricing, error: String(err) }
  }
}

/** Total cost across all models with known pricing. `anyCost` is false when no model in `byModel` had a price (report tokens without a dollar figure in that case). */
export function totalCost(byModel: Map<string, ModelUsage>, pricing: Map<string, Pricing>): { total: number; anyCost: boolean } {
  let total = 0
  let anyCost = false
  for (const [model, usage] of byModel) {
    const price = pricing.get(model)
    if (!price) continue
    total += usage.inputTokens * price.inputPerToken + usage.outputTokens * price.outputPerToken
    anyCost = true
  }
  return { total, anyCost }
}
