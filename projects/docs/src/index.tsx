import z from "zod"

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

type Format = z.infer<typeof Format>
const Format = z.discriminatedUnion("type", [strong, italic, span])

// ELEMENT
const p = z.object({
  type: z.literal("p"),
  content: z.array(Format),
})


const table = z.object({
  type: z.literal("table"),
  headers: z.array(z.string()),
  data: z.array(z.array(p)),
})

export type Element = z.infer<typeof Element>
export const Element = z.discriminatedUnion("type", [p, table])


// DOCUMENT
export type Document = z.infer<typeof Document>
export const Document = z.object({
  title: z.string(),
  description: z.string(),
  content: z.array(Element),
})


const formatRenderer: { [k in Format["type"]]: (format: Extract<Format, { type: k }>) => string } = {
  strong: ({ text }){
    return <strong>{text}</strong>
  }

}

const elementRendere: { [k in Element["type"]]: (element: Extract<Element, { type: k }>) => string } = {}