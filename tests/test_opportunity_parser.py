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


def test_omits_own_sent_messages_by_label():
    msg = {
        "id": "30",
        "threadId": "t30",
        "from": "Lance Wills <some.other.address@gmail.com>",
        "subject": "Re: Head of Marketing opportunity",
        "date": "2026-06-29T12:00:00Z",
        "snippet": "Thanks, following up on the role",
        "labels": ["SENT"],
    }
    assert parse_message(msg) is None


def test_omits_promotions_category_by_label():
    msg = {
        "id": "31",
        "threadId": "t31",
        "from": "Growth Agency <hi@azariangrowthagency.com>",
        "subject": "Your TAM slide is a guess",
        "date": "2026-06-29T12:00:00Z",
        "snippet": "marketing drip about growth opportunity",
        "labels": ["CATEGORY_PROMOTIONS", "INBOX"],
    }
    assert parse_message(msg) is None


def test_omits_linkedin_message_replied_notifications():
    msg = {
        "id": "32",
        "threadId": "t32",
        "from": "Daniel Murphy <hit-reply@linkedin.com>",
        "subject": "Message replied: AI Startup Head of Marketing | $150k-$200k + Equity",
        "date": "2026-06-29T12:00:00Z",
        "snippet": "Hi Lance, just sent an email over",
    }
    assert parse_message(msg) is None


def test_omits_linkedin_social_notifications():
    subjects = [
        "Grazitti Interactive mentioned you in a post.",
        "Ankit Verma tagged you in a post.",
        "Caro Tabar commented on your post.",
        "Messages from Rob and 1 others are waiting",
        "\U0001f525 Lance, keep your Patches streak going!",
        "Lance, please verify your new device",
    ]
    for i, subject in enumerate(subjects, start=40):
        msg = {
            "id": str(i),
            "threadId": f"t{i}",
            "from": "LinkedIn <messages-noreply@linkedin.com>",
            "subject": subject,
            "date": "2026-06-29T12:00:00Z",
            "snippet": "linkedin notification",
        }
        assert parse_message(msg) is None


def test_omits_calendar_robot_reminders():
    msg = {
        "id": "50",
        "threadId": "t50",
        "from": '"beth@example.com (Google Calendar)" <calendar-notification@google.com>',
        "subject": "Reminder: Afresh Sync w/Beth, Sr. Recruiter (Lance Wills) @ Mon Jul 6",
        "date": "2026-07-05T12:00:00Z",
        "snippet": "Interview reminder",
    }
    assert parse_message(msg) is None


def test_keeps_real_linkedin_recruiter_message():
    msg = {
        "id": "51",
        "threadId": "t51",
        "from": "Jane Recruiter <hit-reply@linkedin.com>",
        "subject": "New message: Head of Growth Marketing Opportunity (San Francisco/Remote)",
        "date": "2026-06-29T12:00:00Z",
        "snippet": "Hi Lance, I came across your profile and think you'd be a great fit",
        "labels": ["INBOX", "CATEGORY_SOCIAL"],
    }
    parsed = parse_message(msg)
    assert parsed is not None
    assert parsed["source"] == "LinkedIn"


def test_extracts_company_from_application_receipts():
    cases = [
        ("Lance, your application was sent to Orange Logic", "Orange Logic"),
        ("Your application to Vice President Marketing at Orange Logic", "Orange Logic"),
        ("Thank you for applying to Prolific!", "Prolific"),
        ("Confirm your application for Director of Demand Generation at FurtherAI", "FurtherAI"),
    ]
    for i, (subject, company) in enumerate(cases, start=60):
        msg = {
            "id": str(i),
            "threadId": f"t{i}",
            "from": "LinkedIn <jobs-noreply@linkedin.com>",
            "subject": subject,
            "date": "2026-06-29T12:00:00Z",
            "snippet": "application receipt",
        }
        parsed = parse_message(msg)
        assert parsed is not None, subject
        assert parsed["company"] == company, subject


def test_rejects_day_and_place_fragments_as_companies():
    msg = {
        "id": "70",
        "threadId": "t70",
        "from": "Chinmay Dixit <somebody@example.com>",
        "subject": "Adobe Hiring: Project Manager 5, Hybrid Role @San Jose CA",
        "date": "2026-06-29T12:00:00Z",
        "snippet": "Hi Lance, slots for this role",
    }
    parsed = parse_message(msg)
    assert parsed is not None
    assert parsed["company"] not in {"San", "Mon", "Thu", "Eu"}


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
