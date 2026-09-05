# Teaching and note protocol

## Source priority

Use sources in this order unless the user directs otherwise:

1. Current lecture slide and its speaker transcript.
2. Course outline and instructor-provided material.
3. Course textbook.
4. Prior student notes.
5. Reputable external sources used only to close a real explanatory gap.

Use citations such as `[week-03-lecture-01, p. 12]`, `[transcript-week-03, lines 84–102]`, or a direct web link.

## Explanation standard

A complete substantive-slide explanation should cover:

- What the slide is trying to teach and why it matters.
- Every new term, symbol, component, or assumption.
- How the diagram, equation, table, or code should be read.
- A concrete example, derivation, or trace when it improves understanding.
- Connections to earlier concepts and supporting sources.
- The skill an assessment could test, without exposing past questions.

Do not force every heading when a slide does not need it. Prefer a coherent lesson over a form-filled summary.

## Slide note contract

Keep the existing frontmatter and image. Revise these agent-owned sections as needed:

- `## Explanation`
- `## Walkthrough`
- `## Connections and exam relevance`
- `## Check your understanding`
- `## Sources`

Preserve this entire block exactly, including its markers:

```html
<!-- personal:start -->
## Personal notes

<!-- personal:end -->
```

Do not store raw conversation. Incorporate the durable insight from a follow-up into the relevant agent-owned section.

## Mathematics in notes

Write mathematical notation using the book's KaTeX-compatible Markdown convention:

- Use `$...$` for inline math, such as `$a_{ij}$` or `$m \times n$`.
- Use `$$...$$` on their own lines for display equations.
- Write normal LaTeX inside the delimiters. Use one backslash for commands such as `\frac` and the standard two backslashes (`\\`) for a matrix or aligned-equation row break.
- Escape a literal dollar sign as `\$`, especially when writing currency.
- Keep non-mathematical code containing dollar signs in inline code spans or fenced code blocks.
- Do not use ordinary parentheses as math delimiters, or `\(...\)` and `\[...\]`; use dollar delimiters consistently.
- Treat a failed book build as a math error to fix. The builder validates KaTeX and reports the source file and line instead of silently publishing raw notation.

## Progress contract

Use slide states `unseen`, `teaching`, `understood`, and `review-needed`. Keep the checkpoint on the slide currently being discussed. For each concept, retain related slide IDs, confidence from 0 to 3, concise misconceptions, the last review timestamp, and review priority.

When the student gives a weak answer, explain immediately. Ask a short new check when appropriate, but do not trap the student in an endless Socratic exchange.
