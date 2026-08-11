import { md, type Document } from "@memtree.wiki/docs"

type Vector = readonly number[]

type Embed = (doc: Document) => Promise<Vector>
type Merge = (docs: [Document, Document]) => Document
type Split = (doc: Document) => {
  parent: Document
  children: Document[]
}

function cosineSimilarity(a: Vector, b: Vector): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
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
  search: (vector: Vector, topK?: number) => Promise<SearchResult[]>
  add: (doc: Document, parent: nodeId | null) => Promise<nodeId>
  update: (nodeId: nodeId, doc: Document) => Promise<void>
  reparent: (nodeId: nodeId, parent: nodeId | null) => Promise<void>
  del: (subtree: nodeId) => Promise<void>
  get: (nodeId: nodeId) => Promise<Node>
}

interface Params {
  L: number
  D: number
  T: number

  embed: Embed
  merge: Merge
  split: Split

  store: Store
}

export type API = ReturnType<typeof memTree>

/*
TODO:
- Implementation should be simple:
  - Add: search for most similar node and merge if score > T, otherwise add as an orphan node.
    Do not check if the merged node exceeds L.
  - Maintain:
    1. Split large nodes (adjust store API if needed)
    2. Cluster children with too many siblings (adjust store API if needed)
    This is the user responsibility to call maintain() whenever they want to to keep the structure of the tree balanced.
*/
export function memTree({ L, D, T, embed, merge, split, store }: Params) {
  // SEARCH
  interface SearchParams {
    query: string
    topK?: number
  }

  async function search({ query, topK }: SearchParams) {
    const vector = await embed({ title: "", about: query, content: [] })
    return store.search(vector, topK)
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

  async function add({ doc }: AddParams) {
    const vector = await embed(doc)
    const results = await store.search(vector, 1)
    const best = results[0]

    if (best && best.score >= T) {
      const merged = merge([best.node.doc, doc])
      await store.update(best.node.nodeId, merged)
      await maintainSize(best.node.nodeId)
      return best.node.nodeId
    }

    const parent = best?.node.nodeId ?? null
    const id = await store.add(doc, parent)
    await maintainSize(id)
    if (parent !== null) await maintainFanOut(parent)
    return id
  }

  async function maintainSize(id: nodeId): Promise<void> {
    const node = await store.get(id)
    if (md(node.doc).length <= L) return

    const { parent, children } = split(node.doc)
    await store.update(id, parent)
    for (const child of children) {
      await store.add(child, id)
    }
    await maintainFanOut(id)
  }

  async function cluster(docs: Document[]): Promise<Document[][]> {
    const vectors = await Promise.all(docs.map((doc) => embed(doc)))
    let groups = docs.map((doc, i) => ({ docs: [doc], vector: vectors[i]! }))

    const target = Math.floor(D / 2)
    while (groups.length > target) {
      let bestI = 0
      let bestJ = 1
      let bestScore = -Infinity
      for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          const score = cosineSimilarity(groups[i]!.vector, groups[j]!.vector)
          if (score > bestScore) {
            bestScore = score
            bestI = i
            bestJ = j
          }
        }
      }

      const a = groups[bestI]!
      const b = groups[bestJ]!
      const mergedDocs = [...a.docs, ...b.docs]
      const mergedVector = a.vector.map((v, i) => (v + b.vector[i]!) / 2)
      groups = groups.filter((_, idx) => idx !== bestI && idx !== bestJ)
      groups.push({ docs: mergedDocs, vector: mergedVector })
    }

    return groups.map((g) => g.docs)
  }

  async function maintainFanOut(id: nodeId): Promise<void> {
    const node = await store.get(id)
    if (node.children.length <= D) return

    const children = await Promise.all(node.children.map((childId) => store.get(childId)))
    const groups = await cluster(children.map((child) => child.doc))

    for (const group of groups) {
      const members = children.filter((child) => group.includes(child.doc))
      const [keep, ...rest] = members
      if (!keep || rest.length === 0) continue

      let mergedDoc = keep.doc
      for (const member of rest) {
        mergedDoc = merge([mergedDoc, member.doc])
        for (const grandchildId of member.children) {
          await store.reparent(grandchildId, keep.nodeId)
        }
        await store.del(member.nodeId)
      }
      await store.update(keep.nodeId, mergedDoc)
      await maintainSize(keep.nodeId)
      await maintainFanOut(keep.nodeId)
    }
  }

  // DELETE
  interface DelParams {
    subtreeId: nodeId
  }

  function del({ subtreeId }: DelParams) {
    return store.del(subtreeId)
  }

  // MAINTAIN
  function maintain() { }

  return { search, read, add, del, maintain }
}