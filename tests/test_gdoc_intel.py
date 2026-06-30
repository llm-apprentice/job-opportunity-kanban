import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from gdoc_intel import build_intel_index, reconcile_opportunity


def test_builds_company_role_intel_from_interview_notes():
    text = """
    Bitdrift - Head of Marketing
    Interview notes: founder call with Matt.
    Need to position around observability for mobile apps.

    Paraform / Growth Marketing Lead
    Talked with Ting, VP Marketing at Paraform.
    """

    index = build_intel_index(text)

    assert "bitdrift" in index["aliases"]
    assert index["aliases"]["bitdrift"]["company"] == "Bitdrift"
    assert index["aliases"]["bitdrift"]["role"] == "Head of Marketing"
    assert "paraform" in index["aliases"]
    assert index["aliases"]["paraform"]["company"] == "Paraform"


def test_reconciles_unknown_company_from_gdoc_subject_match():
    index = build_intel_index("""
    Bitdrift - Head of Marketing
    Notes: Lance spoke to founder about the Head of Marketing role.
    """)
    opp = {
        "company": "Unknown company",
        "role": "Lance Wills - Bitdrift Head of Marketing - 5x founding marketer",
        "subject": "Lance Wills - Bitdrift Head of Marketing - 5x founding marketer",
        "notes": "",
    }

    enriched = reconcile_opportunity(opp, index)

    assert enriched["company"] == "Bitdrift"
    assert enriched["role"] == "Head of Marketing"
    assert enriched["companySource"] == "gdoc"
    assert enriched["roleSource"] == "gdoc"
    assert enriched["gdocMatched"] is True


def test_does_not_override_manual_specific_company_with_weaker_match():
    index = build_intel_index("Bitdrift - Head of Marketing")
    opp = {
        "company": "Acme",
        "role": "VP Marketing",
        "subject": "Acme VP Marketing",
        "notes": "",
        "companySource": "manual",
    }

    enriched = reconcile_opportunity(opp, index)

    assert enriched["company"] == "Acme"
    assert enriched.get("companySource") == "manual"


def test_does_not_match_generic_role_words_only():
    index = build_intel_index("Bitdrift - Head of Marketing\nLoop - Founding Product Marketer")
    opp = {
        "company": "Unknown company",
        "role": "Head of Marketing role with ex-Lyft founding team",
        "subject": "Head of Marketing role with ex-Lyft founding team",
        "notes": "",
    }

    enriched = reconcile_opportunity(opp, index)

    assert enriched["company"] == "Unknown company"
    assert not enriched.get("gdocMatched")


def test_matches_by_person_name_and_email_pair():
    text = """
    Bitdrift - Head of Marketing
    People: Alice Recruiter <alice@bitdrift.io>, Matt Founder
    Notes: deep dive on mobile observability.
    """
    index = build_intel_index(text)
    opp = {
        "company": "Unknown company",
        "role": "Intro call",
        "subject": "Follow up from Alice Recruiter",
        "contact": "Alice Recruiter <alice@bitdrift.io>",
        "notes": "",
    }

    enriched = reconcile_opportunity(opp, index)

    assert enriched["company"] == "Bitdrift"
    assert enriched["role"] == "Head of Marketing"
    assert enriched["gdocMatched"] is True


def test_matches_by_email_domain_when_company_unknown():
    text = """
    Paraform - Growth Marketing Lead
    Contact: Ting Chen <ting@paraform.com>
    """
    index = build_intel_index(text)
    opp = {
        "company": "Unknown company",
        "role": "Conversation with Ting",
        "subject": "Re: Growth Marketing Lead",
        "contact": "Ting Chen <ting@paraform.com>",
    }

    enriched = reconcile_opportunity(opp, index)

    assert enriched["company"] == "Paraform"
    assert enriched["role"] == "Growth Marketing Lead"
