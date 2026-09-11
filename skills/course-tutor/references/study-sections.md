# Open study sections

Use this mode for a named course discussion, exam preparation, synthesis, or other open-ended notes. Weekly slide teaching remains the default for lecture requests. Follow the student's instructions and topic changes without imposing a slide sequence, a PDF, or a fixed set of headings.

## Start and maintain a section

- Inspect existing `notes/sections/` pages and `study-data/sections.yml` (if present) before creating a section. Reuse the intended section; ask only when the target is materially ambiguous.
- Use `notes/sections/<slug>/index.md` as its initial authored page. Use lowercase letters, digits, and hyphens for folder and page names. The first `#` heading is its book title. Split into sibling pages when useful, linking them from the index with relative Markdown links such as `[Practice](practice.md)`. Avoid both `<slug>.md` and `<slug>/index.md`, which have the same book URL.
- Establish the purpose and references from the request. Reuse stable IDs from `sources.yml`; new materials follow `material-import.md`, without inventing a week. Sources and weekly metadata are optional. Never require slide preparation merely to start a discussion; use relevant existing extractions or read the supplied material as needed.
- After each substantive exchange, save the durable explanation, worked reasoning, correction, or open question into the relevant page. Default to complete, readable explanations and worked examples; honor requests for concise revision notes. Integrate clarifications instead of appending a transcript. Do not fill unstudied topics with invented coverage.
- Every new page includes exactly one personal block, preserved byte-for-byte on all later edits:

```html
<!-- personal:start -->
## Personal notes

<!-- personal:end -->
```

- Apply the shared citation and math conventions. Use the student's selected references first, then course source priority as applicable. Label unsupported claims, outside enrichment, and invented examples. Student hypotheses are questions until checked. Do not invent citations when no source exists.
- Assessment prep may discuss requested practice questions and solutions. Keep predictions distinct from historical evidence. Comprehension checks follow the student's requested approach; recording an explanation does not establish mastery.
- Save notes and resume state before replying. Briefly identify what was saved. Run `npm run validate` and `npm run notes:build` after creating/restructuring a section, or when checking rendering errors. `npm run notes:dev` automatically reflects saved changes while running; the conversation itself is not a background process.

## Independent resume state

Keep `study-data/progress.yml`'s weekly checkpoint intact during section work. Store section context in `study-data/sections.yml`, which begins with this empty tracked state:

```yaml
version: 1
active_section: null
sections: {}
```

A populated state has this shape:

```yaml
version: 1
active_section: midterm-prep
sections:
  midterm-prep:
    title: Midterm prep
    page: notes/sections/midterm-prep/index.md
    purpose: Review concepts and work through examples
    source_ids: []
    current_topic: null
    next_step: null
    questions_to_revisit: []
    updated_at: null
```

Update the active page, topic, next step, questions, and ISO timestamp after material exchanges. Keep state concise; the Markdown owns the explanations. Preserve other sections. When returning to weekly study, set `active_section: null` without deleting section history. A named resume request takes precedence; an unqualified resume uses a non-null active section, otherwise the weekly checkpoint. If its page is missing, report that and resolve the target rather than silently resuming an unrelated lesson.

Concept mastery remains in `study-data/progress.yml`. Update it only from evidence of understanding, preserving existing related slides; section-only concepts can use `related_slides: []`. Never reset slide progress as a side effect of open study.

## Book and ownership

Files under `notes/sections/` are canonical, tracked Markdown, never generated chapter output. The book discovers them automatically, lists them after Weekly chapters, indexes their text, and includes them in print/PDF output. Relative Markdown links to published pages are rewritten for the book. For a precise anchor, add an explicit HTML `id`; ordinary headings do not automatically receive IDs. Use links to existing weekly chapter anchors for slide references. Source PDFs remain subject to the existing local-material privacy rules.
