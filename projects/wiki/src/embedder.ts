import { txt, type Document } from "@memtree.wiki/docs"
import { embed, type EmbeddingModel } from "ai"


export async function embedder(model: EmbeddingModel) {

    return async (doc: Document) => {
        const { embedding } = await embed({
            model,
            value: txt(doc)
        })
        return embedding
    }
}
