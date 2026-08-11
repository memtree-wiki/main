
import h from "vhtml"
import type { Document } from "."
import { html } from "."

const doc: Document = {
  title: "The Document Schema",
  about: "A short tour of every element and inline format the schema currently supports.",
  content: [
    {
      type: "h2",
      text: "Inline formatting",
    },
    {
      type: "p",
      content: [
        { type: "span", text: "Paragraphs can mix " },
        { type: "strong", text: "strong" },
        { type: "span", text: ", " },
        { type: "em", text: "em" },
        { type: "span", text: ", plain " },
        { type: "span", text: "span" },
        { type: "span", text: " text, and " },
        { type: "a", href: "https://example.com", text: "links" },
        { type: "span", text: "." },
      ],
    },
    {
      type: "h3",
      text: "Lists",
    },
    {
      type: "p",
      content: [{ type: "span", text: "An ordered list:" }],
    },
    {
      type: "ol",
      items: [
        { type: "p", content: [{ type: "span", text: "First step" }] },
        { type: "p", content: [{ type: "span", text: "Second step" }] },
        { type: "p", content: [{ type: "span", text: "Third step" }] },
      ],
    },
    {
      type: "p",
      content: [{ type: "span", text: "An unordered list:" }],
    },
    {
      type: "ul",
      items: [
        { type: "p", content: [{ type: "span", text: "Apples" }] },
        { type: "p", content: [{ type: "span", text: "Oranges" }] },
        { type: "p", content: [{ type: "span", text: "Pears" }] },
      ],
    },
    {
      type: "h3",
      text: "Tables",
    },
    {
      type: "table",
      headers: ["Element", "Purpose"],
      data: [
        [
          { type: "p", content: [{ type: "strong", text: "h2 / h3" }] },
          { type: "p", content: [{ type: "span", text: "Section headings" }] },
        ],
        [
          { type: "p", content: [{ type: "strong", text: "ol / ul" }] },
          { type: "p", content: [{ type: "span", text: "Ordered and unordered lists" }] },
        ],
        [
          { type: "p", content: [{ type: "strong", text: "table" }] },
          { type: "p", content: [{ type: "em", text: "You're looking at it" }] },
        ],
        [
          { type: "p", content: [{ type: "strong", text: "code" }] },
          { type: "p", content: [{ type: "span", text: "Syntax-highlighted code blocks" }] },
        ],
      ],
    },
    {
      type: "h3",
      text: "Code",
    },
    {
      type: "p",
      content: [{ type: "span", text: "Code blocks are highlighted per their declared " }, { type: "strong", text: "lang" }, { type: "span", text: ":" }],
    },
    {
      type: "code",
      lang: "ts",
      content: "function greet(name: string): string {\n  return `Hello, ${name}!`\n}",
    },
  ],
}

if (import.meta.main) {
  const page = "<!doctype html>" + (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{doc.title}</title>
        <link rel="stylesheet" href="example.css" />
      </head>
      <body dangerouslySetInnerHTML={{ __html: html(doc) }} />
    </html>
  )
  console.log(page)
}
