import type { Document } from "@memtree.wiki/docs"

type Vector = readonly number[]

type Embedder = (doc: Document) => Vector
type Merger = (docs: [Document, Document]) => Document

interface Params {
  embedder: Embedder
  merger: Merger
}

export function memTree({ embedder, merger }: Params) { }