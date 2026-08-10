import h from "vhtml"
import z from "zod"

// INLINE
const strong = z.object({
  type: z.literal("strong"),
  text: z.string(),
})

const em = z.object({
  type: z.literal("em"),
  text: z.string(),
})

const span = z.object({
  type: z.literal("span"),
  text: z.string(),
})

const a = z.object({
  type: z.literal("a"),
  href: z.string(),
  text: z.string(),
})

type InlineType = Inline['type']
type Inline = z.infer<typeof Inline>
const Inline = z.discriminatedUnion("type", [strong, em, span, a])

// ELEMENT
const h2 = z.object({
  type: z.literal("h2"),
  text: z.string(),
})

const h3 = z.object({
  type: z.literal("h3"),
  text: z.string(),
})

const p = z.object({
  type: z.literal("p"),
  content: z.array(Inline),
})

const ol = z.object({
  type: z.literal("ol"),
  items: z.array(p),
})

const ul = z.object({
  type: z.literal("ul"),
  items: z.array(p),
})

const table = z.object({
  type: z.literal("table"),
  headers: z.array(z.string()),
  data: z.array(z.array(p)),
})

type ElementType = Element['type']
export type Element = z.infer<typeof Element>
export const Element = z.discriminatedUnion("type", [h2, h3, ol, ul, p, table])


// DOCUMENT
export type Document = z.infer<typeof Document>
export const Document = z.object({
  title: z.string(),
  description: z.string(),
  content: z.array(Element),
})


const inlineHtml: { [k in InlineType]: (format: Extract<Inline, { type: k }>) => string } = {
  strong: ({ text }) => <strong>{text}</strong>,
  em: ({ text }) => <em>{text}</em>,
  span: ({ text }) => <span>{text}</span>,
  a: ({ href, text }) => <a href={href} target="_blank">{text}</a>,
}

function renderInline<T extends InlineType>(format: Extract<Inline, { type: T }>) {
  return inlineHtml[format.type](format)
}

const elementHtml: { [k in ElementType]: (element: Extract<Element, { type: k }>) => string } = {
  h2: ({ text }) => <h2>{text}</h2>,
  h3: ({ text }) => <h3>{text}</h3>,
  p: ({ content }) => <p>{content.map(renderInline)}</p>,
  ol: ({ items }) => <ol>{items.map(renderElement)}</ol>,
  ul: ({ items }) => <ul>{items.map(renderElement)}</ul>,
  table: ({ headers, data }) => (
    <table>
      <thead>
        <tr>{headers.map((header) => <th>{header}</th>)}</tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr>{row.map((cell) => <td>{renderElement(cell)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  ),
}

function renderElement<T extends ElementType>(element: Extract<Element, { type: T }>) {
  return elementHtml[element.type](element)
}

export function html(document: Document): string {
  return (
    <article>
      <h1>{document.title}</h1>
      <p>{document.description}</p>
      {document.content.map(renderElement)}
    </article>
  )
}