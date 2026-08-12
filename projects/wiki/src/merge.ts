import { Document, md } from "@memtree.wiki/docs"
import { generateText, Output, type LanguageModel } from "ai"
import type { Merge } from "."

export function getMerge(model: LanguageModel): Merge {

    return async (docs: Document[]) => {
        const prompt = docs.map((doc) => md(doc)).join("\n\n---\n\n")

        const { output } = await generateText({
            model,
            output: Output.object({ schema: Document }),
            system: [
                "You merge related wiki documents into a single, coherent document.",
                "Preserve every fact from the input documents, remove redundancy, and ",
                "resolve conflicts by favoring the most recent document (given last).",
            ].join(" "),
            prompt: `Merge the following documents into one:\n\n${prompt}`,
        })

        return output
    }
}
