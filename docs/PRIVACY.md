# Public release and privacy checklist

Opportunity Radar is designed to be publishable as a portfolio project while keeping operational job-search data private.

## Never commit

- `.env`, `.env.local`, or any real Convex deployment values.
- Google OAuth tokens or client-secret JSON files.
- Browser profiles/cookies/session state under `data/`.
- Application screenshots, downloaded resumes, generated application artifacts, or raw email exports.
- Personal contact history, recruiter emails, or private notes.
- One-off local automation files named `*.local.*`.

## Safe to commit

- Source code.
- Tests and generic fixtures.
- `.env.example` with empty placeholder values.
- `data/*.example.json` with placeholder values only.
- Docs that describe architecture/workflows without live accounts, tokens, or personal application data.

## Before pushing a public branch

Run:

```bash
bash scripts/secret_scan.sh
npm run build
pytest -q
```

Then review:

```bash
git status --short
git diff --cached
```

If a screenshot or local data file appears in `git status`, remove it from the commit unless it has been deliberately sanitized.
