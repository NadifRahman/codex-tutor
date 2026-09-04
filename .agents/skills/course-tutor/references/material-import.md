# Material import

Use this workflow only when the user asks to import, organize, or register course material.

## Intake

Treat `materials/inbox/` as a staging queue. If the user supplies files from outside the repository, copy them into the inbox first; never remove an external original. Run `npm run materials:inspect` and use `.study-cache/material-inbox.json` to inspect names, hashes, representative PDF pages, and text previews. Visually inspect sampled PDF pages when text alone leaves the classification unclear.

Infer the source type, title, week, lecture or part number, stable ID, final filename, and privacy placement from the filename and content. Use only the source types accepted by `sources.yml`. Prefer stable IDs such as `week-08-lecture-01` and do not change an existing source ID after notes have been created.

## Decisions

Automatically plan high-confidence files. Make a reasonable choice and disclose it for minor uncertainty. When a decision would materially change the source meaning or privacy, leave the file in the inbox and ask one consolidated question covering every ambiguous file.

Ask rather than guess when uncertain about:

- the week or supported lecture;
- lecture material versus an assessment;
- duplicate versus alternate version;
- whether a file may be tracked in Git; or
- a destination collision between different files.

Default textbooks, assessments, recordings, personal or student notes, copyrighted material, and anything with unclear redistribution permission to `materials/local/` with `tracked: false`. Use `materials/weeks/week-NN/` or `materials/course/` with `tracked: true` only when the user has indicated that the material may be versioned.

## Apply

Write `.study-cache/material-import-plan.json` with this shape:

```json
{
  "version": 1,
  "imports": [
    {
      "inbox": "lecture-08.pdf",
      "destination": "materials/weeks/week-08/lecture-08.pdf",
      "source": {
        "id": "week-08-lecture-08",
        "type": "lecture",
        "title": "Week 8 Lecture",
        "week": 8,
        "lecture": 8,
        "tracked": true
      }
    }
  ]
}
```

Include only files whose decisions are resolved. Run `npm run materials:import`, then `npm run validate`. The importer moves inbox files, refuses overwrites and unsafe paths, leaves duplicates in the inbox, and rolls back completed moves if it cannot update `sources.yml`.

Do not run preparation unless the user also asked to prepare the imported material. Report moved files, registered IDs, duplicates, unresolved inbox files, unsupported formats, and validation warnings.
