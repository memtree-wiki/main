import z from "zod"

export namespace docs {
  // FORMAT
  const strong = z.object({
    type: z.literal("strong"),
    text: z.string(),
  })

  const italic = z.object({
    type: z.literal("italic"),
    text: z.string(),
  })

  const span = z.object({
    type: z.literal("span"),
    text: z.string(),
  })

  const format = z.discriminatedUnion("type", [strong, italic, span])

  // ELEMENT
  const p = z.object({
    type: z.literal("p"),
    content: z.array(format),
  })


  export type Element = z.infer<typeof Element>
  export const Element = z.discriminatedUnion("type", [p])


  // DOCUMENT
  export type Document = z.infer<typeof Document>
  export const Document = z.object({
    title: z.string(),
    description: z.string(),
    content: z.array(Element),
  })
}