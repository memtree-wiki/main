import { embed, type EmbeddingModel } from "ai"
import type { Embed } from "."

export function getEmbed(model: EmbeddingModel): Embed {
  return async (text: string) => {
    const { embedding } = await embed({
      model,
      value: text,
    })
    return embedding
  }
}
