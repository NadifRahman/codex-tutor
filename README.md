# Codex Course Tutor Template

This template turns a course repository into an interactive, source-grounded tutor. Add lecture slides and supporting materials, then ask Codex to teach the course one slide at a time. As you study, Codex builds an illustrated set of notes containing each original slide followed by a detailed explanation.

The tutor is designed for technical and STEM courses. It explains material from first principles, answers follow-up questions, checks comprehension at concept boundaries, remembers weak topics, and uses past assessments to prioritize important skills without revealing questions during ordinary lessons.

## Requirements

- Node.js 18.18 through 22. Node 20 or 22 LTS is recommended for new setups.
- npm.
- Codex CLI, IDE extension, or desktop app working in the repository.

No system PDF or OCR package is required. The project uses cross-platform JavaScript dependencies. Poppler or MiKTeX tools already installed on a machine may be used manually, but they are not required. The first page that needs OCR may download Tesseract's English language data; later OCR runs use its local cache.

## Create a course

1. Copy or clone this template into a directory for one course.
2. Install dependencies:
   - Native Windows, macOS, or Linux: run `npm install`.
   - WSL2 with the repository under `/mnt/c`: run `npm run setup:wsl` instead.
3. Run `npm run install:skill` to place the tracked tutor skill where Codex discovers repository skills.
4. Edit `course.yml` with the course code, title, term, and current week.
5. Add course materials with the tutor or register them manually as described below.
6. Run `npm run doctor`, followed by `npm run study:prepare -- --week 1`.
7. Start Codex from the repository and say: `Use $course-tutor to teach me week 1.`

If `.agents` is managed or read-only in your Codex environment, skip step 3. `AGENTS.md` tells Codex to load the tracked skill directly from `skills/course-tutor/SKILL.md`.

### WSL2 with a repository under `/mnt/c`

Use `npm run setup:wsl` instead of `npm install` when the repository is under `/mnt/c`. Some WSL/Windows filesystem or security configurations expose partially written package files during installation. The symptom is an impossible JavaScript syntax error inside unrelated files under `node_modules`, such as `yaml`, `esbuild`, or `markdown-it`.

If you already ran `npm install` and see this error, remove only the generated `node_modules` directory and run:

```bash
npm run setup:wsl
```

The helper installs the locked dependencies in WSL's native cache filesystem and links `node_modules` into the Windows-hosted repository. Source files, notes, and course materials remain on Windows. The skill installer itself is dependency-free, so it can also run before dependency setup.

## Add course materials

### Let the tutor organize an inbox

Put one or many files in `materials/inbox/`, then ask:

```text
Use $course-tutor to import the materials in the inbox for Week 8. Infer what you can and ask me about anything unclear.
```

The tutor inspects filenames and representative content, detects registered duplicates, infers source types and weeks, moves resolved files to their final locations, updates `sources.yml`, and validates the workspace. Ambiguous files and duplicates remain in the inbox. The importer never overwrites an existing destination.

When an AI interface accepts direct attachments, you can instead attach the files and ask the tutor to import them. It first stages a copy in the inbox so the external originals remain untouched.

Private or copyrighted material defaults to `materials/local/` and is not tracked by Git. The tutor asks before making a materially uncertain classification or treating material as safe to version. Importing organizes and registers files; ask it to **import and prepare** if you also want slide images and extracted text generated immediately.

### Add material manually

You can always organize the files yourself. Use these locations as conventions; `sources.yml` is what formally registers a source.

```text
materials/
├── inbox/                  # ignored staging area for agent-assisted import
├── course/                 # course outline and small course-wide files
├── weeks/week-01/          # lecture PDFs, transcripts, homework, labs
└── local/                  # ignored: textbooks, recordings, past exams
```

Each `sources.yml` entry needs a stable `id`, `type`, `title`, and either a `path` or `url`. Weekly sources also use `week` and optionally `lecture`.

```yaml
- id: week-08-lecture-01
  type: lecture
  title: Week 8 Lecture 1
  path: materials/weeks/week-08/lecture-01.pdf
  week: 8
  lecture: 1
  tracked: true
```

Supported source types are `lecture`, `transcript`, `textbook`, `assessment`, `assignment`, `lab`, `homework`, `outline`, `notes`, and `web`. PDF and plain-text/Markdown files are processed locally. Web sources are consulted by the tutor when needed and must be cited.

Large, private, or copyrighted inputs belong under `materials/local/`. That directory is ignored by Git. Do not publish generated slide images or a built book containing course content without permission.

After adding an entry manually, run `npm run validate`, then prepare its week with `npm run study:prepare -- --week N`.

## Weekly workflow

1. Import new files through `materials/inbox/`, or place them in `materials/weeks/week-NN/` or `materials/local/` and register them in `sources.yml` manually.
3. Ask Codex `Use $course-tutor to prepare week N`, or run `npm run study:prepare -- --week N`.
4. Ask Codex `Use $course-tutor to teach me week N`.
5. Discuss each slide. Ask questions whenever an explanation is unclear.
6. The tutor revises that slide's permanent note and waits until you are ready to continue.
7. Later, say `Use $course-tutor to resume` or `Use $course-tutor to review my weak concepts`.

### Study progress

Your current lesson position, slide states, comprehension history, and review queue are stored in `study-data/progress.yml`. The course tutor updates this file automatically after each slide, allowing later sessions to resume from the same point and powering the course dashboard.

You normally do not need to edit this file manually. Keep it if you want your progress to persist, and commit it if you want that progress available on another device.

Other useful prompts:

- `Use $course-tutor to explain slide 14 again with a concrete example.`
- `Use $course-tutor to show how this equation is derived.`
- `Use $course-tutor to practise the 2025 midterm. I want to see solutions on request.`
- `Use $course-tutor to update the assessment map from all past exams.`

## Read the course book

Run `npm run notes:dev` and open the local URL shown in the terminal. The book includes weekly chapters, slide images, explanations, math rendering, navigation, and local search.

For a production build, run `npm run notes:build`. Generated HTML stays local under `.study-cache/book/` and is ignored by Git.

## What gets committed

Commit configuration, manifests, small materials you are permitted to version, slide-note Markdown, study progress, the tutor skill, scripts, tests, and documentation.

Do not commit `materials/local/`, `.study-cache/`, rendered slide images, dependencies, or generated HTML. The preparation command can recreate derived files from the original material.

## Troubleshooting

- **Wrong Node version:** run `node --version`; use a supported version and reinstall dependencies.
- **Random syntax errors inside dependencies on `/mnt/c`:** remove the generated `node_modules` directory and run `npm run setup:wsl`.
- **A source is missing:** verify its path in `sources.yml`. Missing local-only sources are warnings; missing tracked sources fail validation.
- **A PDF has no extracted text:** preparation automatically tries OCR. If OCR initialization or decoding fails, preparation records a page-level warning and continues with embedded text; the rendered page remains available for visual inspection. Use `--no-ocr` to skip OCR deliberately.
- **Notes did not change:** ensure Codex has permission to edit the repository and that you invoked the tutor skill.
- **Skill is not listed:** run `npm run install:skill` and restart Codex. The root `AGENTS.md` fallback still works.
- **Book is stale:** run `npm run notes:assemble` or restart `npm run notes:dev`.

For the software design, state files, data flow, and extension points, read [Technical architecture](docs/architecture.md).
