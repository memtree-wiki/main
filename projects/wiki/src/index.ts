import type { Document } from "@memtree.wiki/docs"

type Vector = readonly number[]

type Embedder = (doc: Document) => Promise<Vector>
type Merger = (docs: [Document, Document]) => Document
type Splitter = (doc: Document) => {
  parent: Document
  children: Document[]
}

interface Params {
  embedder: Embedder
  merger: Merger
  splitter: Splitter
}

type API = ReturnType<typeof memTree>

export function memTree({ embedder, merger, splitter }: Params) {
  // SEARCH
  interface SearchParams {
    query: string
  }

  function search({ }: SearchParams) { }

  // READ
  interface ReadParams {
    nodeId: number
  }

  function read({ nodeId }: ReadParams) { }

  // ADD
  interface AddParams {
    doc: Document
  }

  function add({ doc }: AddParams) { }

  // DELETE
  interface DelParams {
    subtreeId: number
  }

  function del({ subtreeId }: DelParams) { }

  return { search, read, add, del }
}