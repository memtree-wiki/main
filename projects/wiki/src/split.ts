import { Document, md } from "@memtree.wiki/docs"
import { generateText, Output, type LanguageModel } from "ai"
import type { Split } from "."

export function getSplit(model: LanguageModel): Split {
  return async (doc: Document) => {
    const { output } = await generateText({
      model,
      output: Output.array({ element: Document }),
      system: [
        "You split a wiki document that has grown too large into multiple smaller,",
        "coherent documents, each focused on a distinct part of the original topic.",
        "Preserve every fact from the original document; don't drop or duplicate content",
        "across the parts. Give each part its own accurate title. The about field is",
        "embedded for search, so make it a dense, specific summary of that part alone.",
      ].join(" "),
      prompt: `Split the following document:\n\n${md(doc)}`,
    })

    return output
  }
}
