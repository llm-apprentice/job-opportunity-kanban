# Opportunity Radar

A private-by-default job-search Kanban dashboard for tracking opportunities, recruiter/founder/HM threads, LinkedIn message emails, next steps, and outcomes.

## Live app

Open `index.html` locally, or enable GitHub Pages for this repository.

## Columns

- New
- Screen
- Founder/HM
- Offer
- Pass
- Rejected

## Features

- Instantly opens as a static web app — no terminal required once the file is on your machine or published on GitHub Pages.
- Drag-and-drop cards across stages.
- LinkedIn message/email pill so you know to check LinkedIn for JD/history.
- Search and filters: All, LinkedIn, Stale 7d+, High priority.
- Add/edit/delete opportunities locally.
- Import/export JSON.
- No private email data is committed to this repo.

## Local use

Open `index.html` in your browser.

Your board data is stored in your browser's `localStorage`. Use **Export JSON** to back it up.

## Gmail backfill

The Gmail backfill script is intentionally local-only and writes to `data/opportunities.local.json`, which is ignored by git.

```bash
python scripts/gmail_backfill.py --days 60 --out data/opportunities.local.json
```

Then use the dashboard's **Import JSON** button.

## Privacy

This repo is designed to be public-safe. Do not commit:

- `data/opportunities.local.json`
- Gmail OAuth tokens
- raw email exports
- personal contact history
