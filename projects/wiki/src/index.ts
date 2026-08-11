import type { Document } from "@memtree.wiki/docs"

type Vector = readonly number[]

type Embed = (doc: Document) => Promise<Vector>
type Merge = (docs: [Document, Document]) => Document
type Split = (doc: Document) => {
  parent: Document
  children: Document[]
}

type nodeId = number

interface Node {
  nodeId: nodeId
  created: Date
  parent: nodeId | null
  children: nodeId[]
  doc: Document
}

interface SearchResult {
  node: Node
  score: number
}

interface Store {
  search: (vector: Vector) => Promise<SearchResult[]>
  add: (doc: Document) => Promise<nodeId>
  del: (subtree: nodeId) => Promise<void>
  get: (nodeId: nodeId) => Promise<Node>
}

interface Params {
  L: number
  D: number
  embed: Embed
  merge: Merge
  split: Split
  store: Store
}

type API = ReturnType<typeof memTree>

export function memTree({ L, D, embed, merge, split, store }: Params) {
  // SEARCH
  interface SearchParams {
    query: string
  }

  async function search({ query }: SearchParams) {
    const vector = await embed({ title: "", about: query, content: [] })
    return store.search(vector)
  }

  // READ
  interface ReadParams {
    docId: nodeId
  }

  function read({ docId }: ReadParams) {
    return store.get(docId)
  }

  // ADD
  interface AddParams {
    doc: Document
  }

  function add({ doc }: AddParams) { }

  // DELETE
  interface DelParams {
    subtreeId: nodeId
  }

  function del({ subtreeId }: DelParams) {
    return store.del(subtreeId)
  }

  return { search, read, add, del }
}