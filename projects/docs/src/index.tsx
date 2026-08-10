import Prism from "prismjs"
import "prismjs/components/prism-c"
import "prismjs/components/prism-cpp"
import "prismjs/components/prism-csharp"
import "prismjs/components/prism-go"
import "prismjs/components/prism-java"
import "prismjs/components/prism-javascript"
import "prismjs/components/prism-python"
import "prismjs/components/prism-ruby"
import "prismjs/components/prism-rust"
import "prismjs/components/prism-typescript"
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

const code = z.object({
  type: z.literal("code"),
  lang: z.enum(["ts", "js", "py", "java", "c", "cpp", "cs", "rb", "go", "rs"]),
  content: z.string(),
})

const prismLanguage: { [k in z.infer<typeof code>["lang"]]: string } = {
  ts: "typescript",
  js: "javascript",
  py: "python",
  java: "java",
  c: "c",
  cpp: "cpp",
  cs: "csharp",
  rb: "ruby",
  go: "go",
  rs: "rust",
}

type ElementType = Element['type']
export type Element = z.infer<typeof Element>
export const Element = z.discriminatedUnion("type", [h2, h3, ol, ul, p, table, code])


// DOCUMENT
export type Document = z.infer<typeof Document>
export const Document = z.object({
  title: z.string(),
  description: z.string(),
  content: z.array(Element),
})


// HTML
const inlineHtml: { [k in InlineType]: (format: Extract<Inline, { type: k }>) => string } = {
  strong: ({ text }) => <strong>{text}</strong>,
  em: ({ text }) => <em>{text}</em>,
  span: ({ text }) => <span>{text}</span>,
  a: ({ href, text }) => <a href={href} target="_blank">{text}</a>,
}

function renderInlineHtml<T extends InlineType>(format: Extract<Inline, { type: T }>) {
  return inlineHtml[format.type](format)
}

const elementHtml: { [k in ElementType]: (element: Extract<Element, { type: k }>) => string } = {
  h2: ({ text }) => <h2>{text}</h2>,
  h3: ({ text }) => <h3>{text}</h3>,
  p: ({ content }) => <p>{content.map(renderInlineHtml)}</p>,
  ol: ({ items }) => <ol>{items.map(item => <li>{renderElement(item)}</li>)}</ol>,
  ul: ({ items }) => <ul>{items.map(item => <li>{renderElement(item)}</li>)}</ul>,
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
  code: ({ lang, content }) => {
    const prismLang = prismLanguage[lang]
    const highlighted = Prism.highlight(content, Prism.languages[prismLang]!, prismLang)
    return (
      <pre className={`language-${lang}`}>
        <code className={`language-${lang}`} dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    )
  },
}

function renderElement<T extends ElementType>(element: Extract<Element, { type: T }>) {
  return elementHtml[element.type](element)
}

export function html({ title, description, content }: Document) {
  return (
    <article>
      <h1>{title}</h1>
      <p>{description}</p>
      {content.map(renderElement)}
    </article>
  )
}

// MARKDOWN
const inlineMd: { [k in InlineType]: (format: Extract<Inline, { type: k }>) => string } = {
  strong: ({ text }) => `**${text}**`,
  em: ({ text }) => `*${text}*`,
  span: ({ text }) => text,
  a: ({ href, text }) => `[${text}](${href})`,
}

function renderInlineMd<T extends InlineType>(format: Extract<Inline, { type: T }>) {
  return inlineMd[format.type](format)
}

const elementMd: { [k in ElementType]: (element: Extract<Element, { type: k }>) => string } = {
  h2: ({ text }) => `## ${text}\n`,
  h3: ({ text }) => `### ${text}\n`,
  p: ({ content }) => content.map(renderInlineMd).join(" ") + "\n",
  ol: ({ items }) => items.map((item, index) => `${index + 1}. ${renderElement(item)}`).join("\n") + "\n",
  ul: ({ items }) => items.map((item) => `- ${renderElement(item)}`).join("\n") + "\n",
  table: ({ headers, data }) => {
    const headerRow = `| ${headers.join(" | ")} |`
    const separatorRow = `| ${headers.map(() => "---").join(" | ")} |`
    const dataRows = data.map(row => `| ${row.map(cell => renderElement(cell)).join(" | ")} |`).join("\n")
    return `${headerRow}\n${separatorRow}\n${dataRows}\n`
  },
  code: ({ lang, content }) => `\`\`\`${lang}\n${content}\n\`\`\`\n`,
}

export function md({ title, description, content }: Document) {
  // TODO: add a frontmatter with the title and description.
  return [
    `# ${title}\n`,
    `${description}\n`,
    ...content.map(renderElement)
  ].join("\n")
}

// TXT
const inlineTxt: { [k in InlineType]: (format: Extract<Inline, { type: k }>) => string } = {
  strong: ({ text }) => text,
  em: ({ text }) => text,
  span: ({ text }) => text,
  a: ({ href, text }) => text,
}

function renderInlineTxt<T extends InlineType>(format: Extract<Inline, { type: T }>) {
  return inlineTxt[format.type](format)
}

const elementTxt: { [k in ElementType]: (element: Extract<Element, { type: k }>) => string } = {
  h2: ({ text }) => `${text}\n`,
  h3: ({ text }) => `${text}\n`,
  p: ({ content }) => content.map(renderInlineTxt).join(" "),
  ol: elementMd.ol,
  ul: elementMd.ul,
  table: ({ headers, data }) => {
    const headerRow = headers.join("\t")
    // TODO: make sure they are perfectly aligned, maybe use a library for that.
    const dataRows = data.map(row => row.map(cell => renderElement(cell)).join("\t")).join("\n")
    return `${headerRow}\n${dataRows}`
  },
  code: ({ content }) => content,
}

export function txt({ title, description, content }: Document) {
  return [
    title,
    description,
    ...content.map(renderElement)
  ].join("\n")
}