import type { Document } from "@memtree.wiki/docs"

type Vector = readonly number[]

type Embedder = (doc: Document) => Vector

interface Params {
  embedder: Embedder
}

export function memTree({ embedder }: Params) { }