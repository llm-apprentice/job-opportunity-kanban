import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from gmail_backfill import sort_newest_first


def test_keeps_every_message_and_sorts_newest_first():
    rows = [
        {
            "company": "Bitdrift",
            "role": "Head of Marketing",
            "lastTouch": "2026-06-01",
            "gmailMessageId": "old",
            "gmailThreadId": "t1",
            "subject": "Old Bitdrift thread",
        },
        {
            "company": "bitdrift",
            "role": "Head of Marketing",
            "lastTouch": "2026-06-29",
            "gmailMessageId": "new",
            "gmailThreadId": "t1",
            "subject": "Newest Bitdrift thread",
        },
        {
            "company": "Unknown company",
            "role": "Growth Lead",
            "lastTouch": "2026-06-28",
            "gmailMessageId": "unknown",
            "gmailThreadId": "t2",
        },
    ]

    result = sort_newest_first(rows)

    # Same-thread/same-company messages are all preserved (the server merges
    # them onto one card as history) and ordered newest first.
    assert [r["gmailMessageId"] for r in result] == ["new", "unknown", "old"]
