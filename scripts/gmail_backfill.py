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


def dedupe_by_company_keep_newest(rows: list[dict]) -> list[dict]:
    """Collapse records with the same known company, keeping the newest touch.

    Unknown-company rows are preserved because we do not yet know whether they are duplicates.
    """
    best_by_company: dict[str, dict] = {}
    unknowns: list[dict] = []
    for row in rows:
        key = _company_key(row.get("company"))
        if not key:
            unknowns.append(row)
            continue
        current = best_by_company.get(key)
        if current is None or (_date_key(row), row.get("gmailMessageId", "")) > (_date_key(current), current.get("gmailMessageId", "")):
            best_by_company[key] = row
    deduped = unknowns + list(best_by_company.values())
    deduped.sort(key=lambda r: (_date_key(r), r.get("gmailMessageId", "")), reverse=True)
    return deduped

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
        '-from:(beehiiv.com) -from:(mail.beehiiv.com) '
        '-subject:("your posts got") -subject:("impressions last week")'
    )
    msgs = run(GAPI + ["gmail", "search", query, "--max", str(max_results)])

    opps: list[dict] = []
    seen: set[str] = set()
    for msg in msgs:
        parsed = parse_message(msg)
        if not parsed:
            continue
        key = parsed.get("dedupeKey") or parsed.get("gmailMessageId") or parsed["id"]
        if key in seen:
            continue
        seen.add(key)
        opps.append(parsed)
    return dedupe_by_company_keep_newest(opps)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=60)
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
