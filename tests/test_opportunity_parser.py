import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from opportunity_parser import parse_message


def test_extracts_company_from_lance_wills_dash_subject():
    msg = {
        "id": "1",
        "threadId": "t1",
        "from": "Recruiter <person@example.com>",
        "subject": "Lance Wills - Bitdrift Head of Marketing - 5x founding marketer (3x AI), 2 Series As,...",
        "date": "2026-06-29T12:00:00Z",
        "snippet": "Opportunity intro",
    }

    parsed = parse_message(msg)

    assert parsed is not None
    assert parsed["company"] == "Bitdrift"
    assert parsed["role"] == "Head of Marketing"


def test_omits_linkedin_post_performance_email():
    msg = {
        "id": "2",
        "threadId": "t2",
        "from": "LinkedIn <messages-noreply@linkedin.com>",
        "subject": "Lance, your posts got 495 impressions last week",
        "date": "2026-06-29T12:00:00Z",
        "snippet": "See how your posts performed",
    }

    assert parse_message(msg) is None


def test_omits_beehiiv_newsletter():
    msg = {
        "id": "3",
        "threadId": "t3",
        "from": "Sangram <gtmos@mail.beehiiv.com>",
        "subject": "GTM operating system newsletter",
        "date": "2026-06-29T12:00:00Z",
        "snippet": "Newsletter",
    }

    assert parse_message(msg) is None
