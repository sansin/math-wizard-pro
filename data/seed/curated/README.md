# Curated question batches

Hand-curated math questions for the starter pool. Each JSON file in this
directory follows the same schema the production AI generator emits, and
gets validated + verified by `scripts/upload-curated-questions.ts` against
the same checks live-traffic AI output goes through.

## Naming convention

`<skill_id>.d<difficulty>.json` — e.g. `k1.add.single.d2.json`.

You can split a single (skill, difficulty) pair across multiple files
(e.g. `k1.add.single.d2.batch1.json`, `k1.add.single.d2.batch2.json`) if
you want to add to the pool incrementally.

## File schema

```json
{
  "skill_id": "k1.add.single",
  "difficulty": 2,
  "questions": [
    {
      "prompt": "$3 + 4 = ?$",
      "answer": { "type": "numeric", "value": 7 },
      "hints": [
        { "level": 1, "text": "Adding means putting two amounts together." },
        { "level": 2, "text": "Start at 3 and count up 4 more." },
        { "level": 3, "text": "After four steps from 3 you land on the number after 6." }
      ],
      "solution": [
        { "title": "Identify the operation", "detail": "The plus sign means add." },
        { "title": "Count up", "detail": "$3 + 4 = 7$.", "state": "7" }
      ]
    }
  ]
}
```

## Answer kinds

```json
{ "type": "numeric", "value": 7 }                       // most common
{ "type": "numeric", "value": 0.25, "tolerance": 0.01 } // decimals — set tolerance
{ "type": "fraction", "numerator": 3, "denominator": 4 }
{ "type": "expression", "canonical": "6x" }             // mathjs-canonicalized
{ "type": "multipleChoice", "correctIndex": 2, "options": ["A","B","C","D"] }
{ "type": "text", "value": "rectangle" }
```

## Hint rules

Exactly **3** hints, levels 1/2/3:
- **Level 1**: gentle conceptual nudge — does NOT use the actual numbers.
- **Level 2**: strategy or sub-step.
- **Level 3**: nearly-there — must NOT state the final answer.

## LaTeX

Wrap inline math in `$...$`. Block math in `$$...$$`. **Do NOT use a bare
`$` for currency** — write "USD 12" or "12 dollars" instead.

## Upload

Validate without writing:
```
npm run seed:curated:dry
```

Upload everything:
```
npm run seed:curated
```

Single file:
```
npx tsx scripts/upload-curated-questions.ts --file data/seed/curated/k1.add.single.d2.json
```

The uploader runs each draft through the production verifier (`verify()`)
before writing — same check live AI output gets. Failures are logged with
a reason; you can fix the JSON and re-run (idempotent).

Inserted rows:
- `source = 'curated'` → `ProviderBadge` shows "📚 Curated bank"
- `provider = 'claude'` → tracked for diversity metrics
- `verified = true`
