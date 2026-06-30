#!/usr/bin/env python3
"""Opportunity extraction heuristics for Gmail job-search messages."""
from __future__ import annotations

import html
import re
from email.utils import parseaddr
from typing import Any

STAGE = "New"

OMIT_SENDER_PATTERNS = [
    "beehiiv.com",
    "mail.beehiiv.com",
]

OMIT_SUBJECT_PATTERNS = [
    re.compile(r"\byour posts? got\b.*\b(impressions?|views?)\b", re.I),
    re.compile(r"\bpost performance\b", re.I),
    re.compile(r"\bpeople viewed your post\b", re.I),
    re.compile(r"\byour linkedin post\b", re.I),
]

LINKEDIN_PATTERNS = ["linkedin", "new message", "sent you a message", "inmail", "message replied"]
JOB_PATTERNS = [
    "opportunity",
    "role",
    "position",
    "interview",
    "recruiter",
    "hiring",
    "founder",
    "screen",
    "job",
    "career",
    "head of",
    "vp ",
    "chief",
    "marketing",
    "gtm",
    "growth",
]

COMMON_NON_COMPANY = {
    "lance",
    "wills",
    "re",
    "fw",
    "fwd",
    "new",
    "message",
    "opportunity",
    "confirm",
    "your",
    "application",
    "head",
    "vp",
    "chief",
}

ROLE_STARTERS = [
    "Head of",
    "VP",
    "Vice President",
    "Chief",
    "CMO",
    "CRO",
    "GTM",
    "Growth",
    "Marketing",
    "Product Marketing",
    "Developer Relations",
    "DevRel",
    "Founder",
    "Founding",
]


def _clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip()


def should_omit(sender: str, subject: str, snippet: str = "") -> bool:
    hay = f"{sender} {subject} {snippet}".lower()
    if any(p in hay for p in OMIT_SENDER_PATTERNS):
        return True
    if any(p.search(subject) for p in OMIT_SUBJECT_PATTERNS):
        return True
    return False


def infer_source(sender: str, subject: str, snippet: str) -> str:
    hay = f"{sender} {subject} {snippet}".lower()
    return "LinkedIn" if any(p in hay for p in LINKEDIN_PATTERNS) else "Email"


def _sender_domain_company(sender: str) -> str | None:
    _name, email = parseaddr(sender)
    m = re.search(r"@([A-Za-z0-9.-]+)", email or sender)
    if not m:
        return None
    domain = m.group(1).split(".")[0]
    if domain.lower() in {"linkedin", "mail", "gmail", "google", "notifications", "greenhouse", "lever", "ashbyhq", "workable", "paraform"}:
        return None
    return domain.replace("-", " ").title()


def infer_company(sender: str, subject: str, snippet: str = "") -> str:
    subject = _clean(subject)

    # Very common outbound/application format:
    # "Lance Wills - Bitdrift Head of Marketing - 5x founding marketer ..."
    m = re.search(r"^Lance(?:\s+R\.)?\s+Wills\s+-\s+([A-Z][A-Za-z0-9.&-]+)\s+(.+)$", subject)
    if m:
        candidate = m.group(1).strip(" -—–")
        if candidate.lower() not in COMMON_NON_COMPANY:
            return candidate

    patterns = [
        r"\bat\s+([A-Z][A-Za-z0-9.&-]{2,40})(?:\s|$)",
        r"\bwith\s+([A-Z][A-Za-z0-9.&-]{2,40})(?:\s|$)",
        r"\bfor\s+([A-Z][A-Za-z0-9.&-]{2,40})(?:\s|$)",
        r"@\s*([A-Z][A-Za-z0-9.&-]{2,40})(?:\s|$)",
    ]
    for pat in patterns:
        m = re.search(pat, subject)
        if m and m.group(1).lower() not in COMMON_NON_COMPANY:
            return m.group(1).strip(" .,-—–")

    domain_company = _sender_domain_company(sender)
    if domain_company:
        return domain_company

    return "Unknown company"


def infer_role(subject: str, snippet: str = "") -> str:
    subject = _clean(subject)
    text = _clean(f"{subject} {snippet}")

    # Paired with company extraction above: remove "Lance Wills - Company " and keep role until next dash.
    m = re.search(r"^Lance(?:\s+R\.)?\s+Wills\s+-\s+[A-Z][A-Za-z0-9.&-]+\s+(.+?)(?:\s+-\s+|$)", subject)
    if m:
        return m.group(1).strip(" .,-—–")[:90]

    m = re.search(r"(?:role|position|opportunity|opening)[:\s-]+([^|—–\n]{4,90})", text, re.I)
    if m:
        return m.group(1).strip(" .,-—–")[:90]

    for starter in ROLE_STARTERS:
        m = re.search(rf"\b({re.escape(starter)}[^|—–\n]{{3,90}})", text, re.I)
        if m:
            return m.group(1).strip(" .,-—–")[:90]

    return subject[:90] if subject else "Unknown role"


def stable_dedupe_key(sender: str, subject: str) -> str:
    normalized_subject = re.sub(r"^(re|fw|fwd):\s*", "", _clean(subject), flags=re.I).lower()
    normalized_sender = parseaddr(sender)[1].lower() or sender.lower()
    return f"{normalized_sender}|{normalized_subject}"


def parse_message(message: dict[str, Any]) -> dict[str, Any] | None:
    sender = _clean(message.get("from", ""))
    subject = _clean(message.get("subject", ""))
    snippet = _clean(message.get("snippet", ""))
    hay = f"{sender} {subject} {snippet}".lower()

    if should_omit(sender, subject, snippet):
        return None
    if not any(p in hay for p in JOB_PATTERNS + LINKEDIN_PATTERNS):
        return None

    source = infer_source(sender, subject, snippet)
    return {
        "id": message.get("id") or stable_dedupe_key(sender, subject),
        "gmailMessageId": message.get("id") or "",
        "gmailThreadId": message.get("threadId") or "",
        "dedupeKey": stable_dedupe_key(sender, subject),
        "company": infer_company(sender, subject, snippet),
        "role": infer_role(subject, snippet),
        "stage": STAGE,
        "source": source,
        "contact": sender,
        "priority": "Medium",
        "lastTouch": ((message.get("date") or "")[:10] if message.get("date") else ""),
        "nextStep": "Review thread / JD",
        "subject": subject,
        "url": "",
        "notes": snippet,
        "snippet": snippet,
    }
