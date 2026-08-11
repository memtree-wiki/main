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

interface Store {
  search: (query: string) => Promise<Node[]>
  add: (doc: Document) => Promise<nodeId>
  del: (subtree: nodeId) => Promise<void>
  get: (nodeId: nodeId) => Promise<Node>
}

interface Params {
  embed: Embed
  merge: Merge
  split: Split
  store: Store
}

type API = ReturnType<typeof memTree>

export function memTree({ embed, merge, split }: Params) {
  // SEARCH
  interface SearchParams {
    query: string
  }

  function search({ }: SearchParams) { }

  // READ
  interface ReadParams {
    docId: nodeId
  }

  function read({ docId }: ReadParams) { }

  // ADD
  interface AddParams {
    doc: Document
  }

  function add({ doc }: AddParams) { }

  // DELETE
  interface DelParams {
    subtreeId: nodeId
  }

  function del({ subtreeId }: DelParams) { }

  return { search, read, add, del }
}