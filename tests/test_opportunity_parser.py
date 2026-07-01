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


def test_omits_messages_from_lance_personal_email():
    msg = {
        "id": "4",
        "threadId": "t4",
        "from": "Lance Wills <lance.r.wills@gmail.com>",
        "subject": "Re: Hobbes Founding Growth Lead",
        "date": "2026-06-29T12:00:00Z",
        "snippet": "Thank you for speaking with me about the opportunity",
    }

    assert parse_message(msg) is None


def test_omits_calendar_zoom_and_google_meet_invites():
    subjects = [
        "Invitation: Lance Wills Zoom Interview with Maggie O'Gorman",
        "Google Meet: Founder screen for Head of Marketing role",
        "Calendar invite: Product Marketing Manager interview",
    ]
    for i, subject in enumerate(subjects, start=10):
        msg = {
            "id": str(i),
            "threadId": f"t{i}",
            "from": "Calendar <calendar-notification@google.com>",
            "subject": subject,
            "date": "2026-06-29T12:00:00Z",
            "snippet": "Interview opportunity",
        }
        assert parse_message(msg) is None


def test_normalizes_rfc2822_email_date_for_newest_dedupe():
    msg = {
        "id": "20",
        "threadId": "t20",
        "from": "Recruiter <person@example.com>",
        "subject": "Lance Wills - Bitdrift Head of Marketing - 5x founding marketer",
        "date": "Wed, 24 Jun 2026 16:01:22 -0700",
        "snippet": "Opportunity intro",
    }

    parsed = parse_message(msg)

    assert parsed is not None
    assert parsed["lastTouch"] == "2026-06-24"
