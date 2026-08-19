import { generateObject } from "ai"
import { z } from "zod"
import type { store } from "@memtree.wiki/store"

export namespace mem {
  export interface TaggerArgs {
    msgs: store.Msg[]
    existingTags: string[]
  }

  export interface TaggedMsg extends store.Msg {
    tags: string[]
  }

  export type Tagger = (args: TaggerArgs) => Promise<TaggedMsg[]>

  export interface UsageInfo {
    model: string
    usage: unknown
  }

  const TAGGER_MODEL = "openai/gpt-5-mini"

  const TagResult = z.object({
    // One entry per input message index -- omitted indices are treated as untagged rather than
    // forcing the model to emit an empty `tags: []` for every filler message.
    tagged: z.array(
      z.object({
        index: z.number().int(),
        tags: z.array(z.string()),
      }),
    ),
  })

  function normalizeTag(tag: string): string {
    return tag
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
  }

  /**
   * Tags each message in `msgs` with 0+ short topical tags, strongly preferring to reuse
   * `existingTags` over minting near-duplicates. `onUsage`, if given, is awaited once per model
   * call with the token usage, in the shape `eval/src/usage.ts` expects to log/price.
   */
  export function createTagger(onUsage?: (info: UsageInfo) => void | Promise<void>): Tagger {
    return async function tag({ msgs, existingTags }) {
      if (msgs.length === 0) return []

      const transcript = msgs.map((msg, i) => `[${i}] ${msg.speaker}: ${msg.text}`).join("\n")

      const { object, usage } = await generateObject({
        model: TAGGER_MODEL,
        schema: TagResult,
        system: [
          "You tag messages from a personal conversation so they can later be filtered by topic.",
          'For each message, assign 0 or more short topical tags (lowercase, kebab-case, e.g. "travel-plans", "family").',
          "Strongly prefer reusing one of the existing tags listed below when it fits the message; only invent a new tag when none of the existing ones apply.",
          "Skip tags entirely for filler messages (greetings, acknowledgements) that carry no topic of their own.",
          "Return one entry per message index given, omitting indices you'd tag with nothing.",
        ].join(" "),
        prompt: `Existing tags: ${existingTags.length > 0 ? existingTags.join(", ") : "(none yet)"}\n\nMessages:\n${transcript}`,
      })

      await onUsage?.({ model: TAGGER_MODEL, usage })

      const byIndex = new Map(object.tagged.map((entry) => [entry.index, entry.tags]))
      return msgs.map((msg, i) => ({
        ...msg,
        tags: [...new Set((byIndex.get(i) ?? []).map(normalizeTag).filter(Boolean))],
      }))
    }
  }
}
