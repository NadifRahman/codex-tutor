# Teaching and note protocol

## Default model policy

The course workspace defaults to `gpt-5.6-luna` at Medium reasoning and standard speed. This is the normal setting for slide-by-slide teaching and should produce detailed, source-grounded explanations under this protocol.

Use lighter reasoning for title, agenda, recap, and straightforward definition slides when available. Escalate only when the current slide genuinely needs deeper analysis: a dense proof or derivation, an ambiguous visual, a multi-step code trace, conflicting source material, or a persistent misconception after explanation. Do not use Fast mode, Ultra, Max, or high reasoning for routine slides.

Model choice is a default, not a constraint: an explicit user choice takes precedence. If escalation is needed, preserve the current slide checkpoint and explain why the extra depth is warranted.

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

## Lesson reply contract

End every slide response with an explicit prompt that tells the student how to continue. Do not assume that the student already knows the lesson workflow, and accept natural-language equivalents rather than requiring exact commands.

After a substantive slide, use this compact menu, adapted only when an option is not relevant:

> **Your turn — reply with:**
> - your answer to the comprehension question;
> - **Understood** to mark this slide understood and continue;
> - **Next slide** to continue without marking it understood;
> - **Still confused** or **More detail** for another explanation;
> - or any question you have.

For a title, agenda, or administrative slide where a comprehension question would be mechanical, use: “Reply **Next slide** to continue, or tell me what you'd like clarified.”

Apply these actions consistently:

- **Understood**: set the current slide to `understood`, then advance and teach the next slide.
- **Next slide**: advance the checkpoint without raising concept confidence or recording mastery; leave the previous slide as `teaching` unless it already has a stronger state.
- **Still confused** or **More detail**: remain on the current slide, reteach or expand the explanation, and offer the reply prompt again.
- **Comprehension answer**: evaluate the answer and update confidence or misconceptions under the progress contract, but do not advance until the student then says **Understood**, **Next slide**, or a natural-language equivalent.
- **Weak answer**: explain the correct reasoning immediately and retain the existing `review-needed` workflow.

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

## Open study mode

For course discussions and named study sections, follow [Study sections](study-sections.md). The slide loop and slide-note headings apply to weekly teaching; open study retains shared citation, math, personal-note, and evidence-based mastery rules while following the student's topic choices.
