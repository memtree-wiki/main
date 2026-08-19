import type { store } from "@memtree.wiki/store"

export namespace mem {
    interface TaggerArgs {
        msgs: store.Msg[]
        existingTags: string[]
    }

    interface TaggedMsg extends store.Msg {
        tags: string[]
    }

    type tagger = (args: TaggerArgs) => Promise<TaggedMsg[]>
}