# Technical architecture

## Purpose

The repository separates deterministic document processing from judgment-heavy teaching. Scripts reliably turn source files into page text and images; Codex interprets those artifacts, teaches the student, and maintains human-readable notes and learning state.

## Repository map

```text
AGENTS.md                 Persistent repository behavior
course.yml                Course identity and teaching preferences
sources.yml               Stable catalog of all source material
materials/                Original tracked and local-only inputs
skills/course-tutor/      Canonical tutor skill and teaching policy
tools/                    Deterministic ingestion and publishing commands
notes/slides/             Canonical one-file-per-slide notes
notes/chapters/           Generated continuous weekly chapters
study-data/               Durable progress and assessment analysis
.study-cache/             Ignored extracted text, metadata, and hashes
notes/public/generated/   Ignored rendered slide images
```

In normal repositories, `npm run install:skill` copies the canonical skill to `.agents/skills/course-tutor`, the Codex repo-skill discovery location. The canonical copy stays under `skills/` so managed environments that mount `.agents` read-only can still use it through `AGENTS.md`.

## Data flow

```text
course files + sources.yml
            │
            ▼
     study:prepare
       ├── validate source identity and hash
       ├── extract page text and positions
       ├── render lecture/assessment pages
       ├── OCR pages with insufficient text
       └── create missing slide-note shells
            │
            ├──────────────► .study-cache/sources/<source-id>/
            ├──────────────► notes/public/generated/<source-id>/
            └──────────────► notes/slides/week-NN/<source-id>/
                                      │
                                      ▼
                           interactive tutor session
                            ├── consult course sources
                            ├── explain and question
                            ├── revise slide note
                            └── update mastery/checkpoint
                                      │
                                      ▼
                              notes:assemble
                                      │
                                      ▼
                      local searchable HTML book
```

## Component responsibilities

### Repository guidance

`AGENTS.md` contains brief invariants that apply whenever Codex works in the repository. It points study requests to the tutor skill and protects personal notes and private material.

### Course tutor skill

The skill owns the interactive protocol: source selection, assessment-aware emphasis, first-principles explanation, comprehension checks, waiting behavior, note revision, and mastery updates. Keeping the workflow in a skill makes it portable across cloned courses without bloating general repository instructions.

### Processing tools

The tools use Node filesystem APIs for consistent Windows, WSL2, macOS, and Linux path behavior. PDF.js extracts text and page geometry. A prebuilt Node canvas renders full pages, preserving diagrams in context. Tesseract.js is a fallback for image-only pages.

For a repository under `/mnt/c`, `tools/wsl-install.sh` installs the lockfile into WSL's native cache and links only the ignored `node_modules` directory back into the repository. This avoids partial package writes sometimes observed on Windows-mounted filesystems and does not move or duplicate course data. `tools/install-skill.mjs` intentionally uses only built-in Node modules so it remains usable before dependencies are installed or when `node_modules` is damaged.

The custom canvas factory is supplied both when PDF.js opens the document and when it renders a page. Document-level registration is required for PDFs that cache shadings or patterns outside an individual render call.

The original PDF is never modified. A content hash identifies cached work, so an unchanged source can be skipped. Changing a PDF creates new derived data but does not overwrite an existing explanation or the student-owned note section. OCR is best-effort: initialization, language-data, or image-decoding failures are recorded in page metadata and the source manifest but do not abort preparation.

### Canonical notes and derived output

Each slide Markdown file is canonical. It contains agent-managed teaching sections and a marker-delimited personal section. Its slide image uses a filesystem-relative path so the image works in an editor's Markdown preview. Chapter assembly rewrites that reference to the `/generated/` site path. Weekly chapter files, slide PNGs, extracted source pages, and HTML are derived and ignored by Git. A small repository-owned generator renders Markdown with Markdown-it, adds KaTeX math assets, builds a local search index, and serves the output with Node's HTTP server. It intentionally avoids a large web framework.

This division makes individual explanations easy to revise and merge while still producing a continuous book for reading.

### Learning state

`study-data/progress.yml` stores the active checkpoint and concept mastery. Slide states are `unseen`, `teaching`, `understood`, or `review-needed`. Concepts retain confidence, misconceptions, related slides, and review priority across Codex sessions.

`study-data/assessment-map.md` stores topic frequency, question style, required depth, and page-level assessment references. Ordinary lessons may use these trends for emphasis but may not reveal exact questions. Assessment-practice mode can show a solution whenever the student requests it.

## Source grounding

The source priority is lecture material, transcript, textbook, prior course notes, and then reputable external sources. Every permanent factual addition should cite a stable source ID and page, transcript line range, or external URL.

The tutor must distinguish course claims from enrichment and predictions. Assessment frequency is evidence of prior emphasis, not a guarantee about a future exam.

## Update ownership

The tutor may update explanation, walkthrough, connections, exam relevance, citations, and review sections. It must preserve content between the personal markers exactly:

```html
<!-- personal:start -->
Student-authored content
<!-- personal:end -->
```

Preparation may create missing files but may not replace existing slide notes. Chapter assembly is allowed to replace generated chapter files because they are derived exclusively from canonical notes.

## Privacy and copyright

The default workflow processes local files locally. Large and private files are placed under `materials/local/`, which is ignored by Git. Rendered slide pages, OCR output, cached web content, and built HTML are also ignored because they can reproduce copyrighted content. Tesseract may download its English recognition data on first use, but it does not upload the page being recognized.

The tutor may browse externally only when course sources leave a meaningful gap. External material must be cited and should not be copied at excessive length.

## Extension points

- Add automatic audio transcription as a new preprocessing adapter that outputs the existing line-numbered transcript format.
- Add a PDF export adapter that renders the canonical Markdown through Pandoc/LaTeX or a browser print pipeline.
- Add semantic retrieval behind the source-search interface if lexical page search becomes insufficient.
- Add new teaching modes as separate skill workflows while preserving the note and mastery contracts.
- Add new source types by extending manifest validation and routing without changing existing IDs.
- Replace the static publisher with another renderer because publishing consumes canonical Markdown rather than owning it.
