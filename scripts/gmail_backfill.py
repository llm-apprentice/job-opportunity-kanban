#!/usr/bin/env python3
"""Backfill job opportunities from Gmail search results.

Requires Hermes Google Workspace setup first. Writes private local data only.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import date, timedelta
from pathlib import Path

from opportunity_parser import parse_message


def _company_key(company: str | None) -> str:
    company = (company or "").strip().lower()
    if not company or company == "unknown company":
        return ""
    return " ".join(company.replace(".", " ").replace("-", " ").split())


def _date_key(row: dict) -> str:
    return row.get("lastTouch") or ""


def sort_newest_first(rows: list[dict]) -> list[dict]:
    """Newest first so an inserted card's headline fields come from the
    latest message; older rows then merge in as history via isIncomingNewer.

    Thread/company collapsing happens server-side in upsertFromGmailBatch,
    which records every message on its card — collapsing here would lose
    conversation history.
    """
    return sorted(rows, key=lambda r: (_date_key(r), r.get("gmailMessageId", "")), reverse=True)

GAPI = ["python", str(Path.home() / ".hermes/skills/productivity/google-workspace/scripts/google_api.py")]


def run(cmd: list[str]):
    p = subprocess.run(cmd, text=True, capture_output=True)
    if p.returncode:
        raise SystemExit(p.stderr or p.stdout)
    return json.loads(p.stdout)


def collect_opportunities(days: int = 60, max_results: int = 150) -> list[dict]:
    after = (date.today() - timedelta(days=days)).strftime("%Y/%m/%d")
    query = (
        f'after:{after} '
        '(linkedin OR recruiter OR hiring OR opportunity OR interview OR founder OR '
        '"sent you a message" OR "head of" OR "VP Marketing" OR "GTM") '
        '-from:me -category:promotions '
        '-from:(beehiiv.com) -from:(mail.beehiiv.com) '
        '-from:(messages-noreply@linkedin.com) -from:(security-noreply@linkedin.com) '
        '-from:(calendar-notification@google.com) '
        '-subject:("your posts got") -subject:("impressions last week") '
        '-subject:("Message replied")'
    )
    msgs = run(GAPI + ["gmail", "search", query, "--max", str(max_results)])

    opps: list[dict] = []
    seen: set[str] = set()
    for msg in msgs:
        parsed = parse_message(msg)
        if not parsed:
            continue
        key = parsed.get("gmailMessageId") or parsed.get("dedupeKey") or parsed["id"]
        if key in seen:
            continue
        seen.add(key)
        opps.append(parsed)
    return sort_newest_first(opps)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--out", default="data/opportunities.local.json")
    ap.add_argument("--max", type=int, default=150)
    args = ap.parse_args()

    opps = collect_opportunities(days=args.days, max_results=args.max)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(opps, indent=2), encoding="utf-8")
    print(f"Wrote {len(opps)} opportunities to {out}")


if __name__ == "__main__":
    main()
