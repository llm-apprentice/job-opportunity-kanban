import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from gmail_backfill import dedupe_by_company_keep_newest


def test_dedupes_company_records_and_keeps_newest():
    rows = [
        {
            "company": "Bitdrift",
            "role": "Head of Marketing",
            "lastTouch": "2026-06-01",
            "gmailMessageId": "old",
            "subject": "Old Bitdrift thread",
        },
        {
            "company": "bitdrift",
            "role": "Head of Marketing",
            "lastTouch": "2026-06-29",
            "gmailMessageId": "new",
            "subject": "Newest Bitdrift thread",
        },
        {
            "company": "Unknown company",
            "role": "Growth Lead",
            "lastTouch": "2026-06-28",
            "gmailMessageId": "unknown",
        },
        {
            "company": "Hobbes",
            "role": "Founding Growth Lead",
            "lastTouch": "2026-06-20",
            "gmailMessageId": "hobbes",
        },
    ]

    deduped = dedupe_by_company_keep_newest(rows)

    assert len(deduped) == 3
    bitdrift = [r for r in deduped if r["company"].lower() == "bitdrift"]
    assert len(bitdrift) == 1
    assert bitdrift[0]["gmailMessageId"] == "new"
    assert any(r["company"] == "Unknown company" for r in deduped)
    assert any(r["company"] == "Hobbes" for r in deduped)
