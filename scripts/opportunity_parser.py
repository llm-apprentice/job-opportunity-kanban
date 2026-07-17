#!/usr/bin/env python3
"""Opportunity extraction heuristics for Gmail job-search messages."""
from __future__ import annotations

import html
import re
from email.utils import parseaddr, parsedate_to_datetime
from typing import Any

STAGE = "New"

MY_EMAILS = {"lance.r.wills@gmail.com", "alphascorp@gmail.com"}

# Gmail labels that mark a message as not-an-opportunity regardless of content.
OMIT_LABELS = {"SENT", "DRAFT", "CATEGORY_PROMOTIONS", "SPAM", "TRASH"}

# Senders that only ever produce noise: notification relays, newsletters,
# calendar robots, digest engines. Matched as substrings of the sender email.
OMIT_SENDER_PATTERNS = [
    "beehiiv.com",
    "mail.beehiiv.com",
    "substack.com",
    "mailchi.mp",
    "mailchimp.com",
    "convertkit.com",
    "hubspotemail.net",
    # LinkedIn notification relays (NOT hit-reply@linkedin.com, which carries
    # real recruiter messages).
    "messages-noreply@linkedin.com",
    "security-noreply@linkedin.com",
    "notifications-noreply@linkedin.com",
    "jobalerts-noreply@linkedin.com",
    "invitations@linkedin.com",
    "groups-noreply@linkedin.com",
    "api-noreply@linkedin.com",
    "@eml.linkedin.com",
    "chat-noreply@google.com",
    # Job-platform marketing (distinct from transactional greenhouse-mail.io receipts).
    "greenhouse-jobs",
    "jobmorph",
    "synapserecruiternetwork.com",
    # Calendar robots — meetings already exist as tiles/threads.
    "calendar-notification@google.com",
    "calendar-server.bounces.google.com",
    # Known drip/newsletter senders that land in the primary inbox.
    "azariangrowthagency.com",
    "erikcharlesconsulting.com",
    "talent@getclera.com",
]

OMIT_SUBJECT_PATTERNS = [
    re.compile(r"\byour posts? got\b.*\b(impressions?|views?)\b", re.I),
    re.compile(r"\bpost performance\b", re.I),
    re.compile(r"\bpeople viewed your post\b", re.I),
    re.compile(r"\byour linkedin post\b", re.I),
    re.compile(r"\bzoom\b", re.I),
    re.compile(r"\bgoogle\s+meet\b", re.I),
    re.compile(r"\bcalendar\s+invite\b", re.I),
    re.compile(r"\binvitation:\s+.*\b(interview|zoom|meet)\b", re.I),
    # Calendar robot subjects that slip past sender checks (forwarded copies).
    re.compile(r"^(reminder|notification|invitation|updated invitation|accepted|declined|canceled event|confirmed):", re.I),
    re.compile(r"\binvitation from an unknown sender\b", re.I),
    # LinkedIn thread-reply notifications: the conversation is already a tile.
    re.compile(r"^message replied:", re.I),
    re.compile(r"\breplied to your message\b", re.I),
    # LinkedIn social/engagement notifications.
    re.compile(r"\b(mentioned|tagged) you in a post\b", re.I),
    re.compile(r"\bcommented on your post\b", re.I),
    re.compile(r"\breacted to your\b", re.I),
    re.compile(r"\bstreak\b", re.I),
    re.compile(r"\bmessages? from .* (is|are) waiting\b", re.I),
    re.compile(r"\bverify your new device\b", re.I),
    re.compile(r"\byour application was viewed\b", re.I),
    # Digest / drip marketing subjects.
    re.compile(r"\byour matched opportunities\b", re.I),
    re.compile(r"\bsee the latest roles\b", re.I),
    re.compile(r"\bjob alert\b", re.I),
    re.compile(r"\bjobs? for you\b", re.I),
    re.compile(r"\bnewsletter\b", re.I),
    re.compile(r"\bwebinar\b", re.I),
]

# Drip-marketing snippet tells: single occurrences are common in legit mail,
# so require a no-reply-ish sender as well (see should_omit).
UNSUBSCRIBE_RE = re.compile(r"\bunsubscribe\b|\bemail preferences\b|\bopt.?out\b", re.I)

LINKEDIN_PATTERNS = ["linkedin", "new message", "sent you a message", "inmail"]
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
    # Calendar/date fragments that regexes mistake for companies.
    "mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat", "sun",
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
    # Location/format fragments.
    "san", "los", "eu", "us", "usa", "uk", "remote", "hybrid", "onsite",
    # Role words that regexes mistake for companies ("for Founding GTM Lead").
    "founding", "founder", "marketing", "gtm", "growth", "product",
    "senior", "director", "manager", "lead", "principal", "staff",
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


def _strip_reply_prefixes(subject: str) -> str:
    return re.sub(r"^((re|fw|fwd|ooo re)\s*:\s*)+", "", subject, flags=re.I).strip()


def should_omit(sender: str, subject: str, snippet: str = "", labels: list[str] | None = None) -> bool:
    hay = f"{sender} {subject} {snippet}".lower()
    if labels and OMIT_LABELS.intersection(labels):
        return True
    _name, sender_email = parseaddr(sender)
    sender_email = sender_email.lower()
    if sender_email in MY_EMAILS:
        return True
    if any(p in hay for p in OMIT_SENDER_PATTERNS):
        return True
    if any(p.search(subject) for p in OMIT_SUBJECT_PATTERNS):
        return True
    # Newsletter/drip heuristic: unsubscribe language from a robot sender.
    if UNSUBSCRIBE_RE.search(snippet) and re.search(r"\b(no-?reply|newsletter|hello|hi|team|digest|updates?)@", sender_email):
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
    if domain.lower() in {
        "linkedin", "mail", "gmail", "google", "notifications", "greenhouse",
        "lever", "ashbyhq", "workable", "paraform", "eu", "us", "no-reply",
        "noreply", "email", "e", "hi", "hello", "smartrecruiters", "myworkday",
        "icims", "jobvite", "bamboohr", "indeed", "ziprecruiter", "glassdoor",
        "wellfound", "eml",
    }:
        return None
    return domain.replace("-", " ").title()


def _valid_company(candidate: str) -> bool:
    candidate = candidate.strip(" .,-—–")
    return len(candidate) >= 2 and candidate.lower() not in COMMON_NON_COMPANY


def infer_company(sender: str, subject: str, snippet: str = "") -> str:
    subject = _strip_reply_prefixes(_clean(subject))

    # ATS / job-board application receipts carry the company after a fixed phrase:
    # "Lance, your application was sent to Orange Logic"
    # "Your application to Vice President Marketing at Orange Logic"
    # "Thank you for applying to Prolific!"
    # "Confirm your application for Director of Demand Generation at FurtherAI"
    receipt_patterns = [
        r"application was sent to\s+(.{2,60})$",
        r"(?:your application|confirm your application)\s+(?:to|for)\s+.*?\bat\s+([A-Z0-9][\w.&' -]{1,50})$",
        r"thank you for applying to\s+(.{2,60}?)[!.]?$",
        r"thank you for your interest in\s+(.{2,60}?)[!.]?$",
    ]
    for pat in receipt_patterns:
        m = re.search(pat, subject, re.I)
        if m and _valid_company(m.group(1)):
            return m.group(1).strip(" .,-—–!")

    # Very common outbound/application format:
    # "Lance Wills - Bitdrift Head of Marketing - 5x founding marketer ..."
    m = re.search(r"^Lance(?:\s+R\.)?\s+Wills\s+-\s+([A-Z][A-Za-z0-9.&-]+)\s+(.+)$", subject)
    if m and _valid_company(m.group(1)):
        return m.group(1).strip(" -—–")

    patterns = [
        r"\bat\s+([A-Z][A-Za-z0-9.&-]{2,40})(?:\s|$)",
        r"\bwith\s+([A-Z][A-Za-z0-9.&-]{2,40})(?:\s|$)",
        r"\bfor\s+([A-Z][A-Za-z0-9.&-]{2,40})(?:\s|$)",
        r"@\s*([A-Z][A-Za-z0-9.&-]{2,40})(?:\s|$)",
    ]
    for pat in patterns:
        m = re.search(pat, subject)
        if m and _valid_company(m.group(1)):
            return m.group(1).strip(" .,-—–")

    domain_company = _sender_domain_company(sender)
    if domain_company and _valid_company(domain_company):
        return domain_company

    return "Unknown company"


def infer_role(subject: str, snippet: str = "") -> str:
    subject = _strip_reply_prefixes(_clean(subject))
    text = _clean(f"{subject} {snippet}")

    # Paired with company extraction above: remove "Lance Wills - Company " and keep role until next dash.
    m = re.search(r"^Lance(?:\s+R\.)?\s+Wills\s+-\s+[A-Z][A-Za-z0-9.&-]+\s+(.+?)(?:\s+-\s+|$)", subject)
    if m:
        return m.group(1).strip(" .,-—–")[:90]

    # Application receipts: "Your application to <role> at <company>",
    # "Confirm your application for <role> at <company>".
    m = re.search(r"(?:your application|confirm your application)\s+(?:to|for)\s+(.+?)\s+at\s+[A-Z]", subject, re.I)
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
    normalized_subject = re.sub(r"^((re|fw|fwd|ooo re)\s*:\s*)+", "", _clean(subject), flags=re.I).lower()
    normalized_sender = parseaddr(sender)[1].lower() or sender.lower()
    return f"{normalized_sender}|{normalized_subject}"


def normalize_date(value: str | None) -> str:
    value = _clean(value)
    if not value:
        return ""
    try:
        return parsedate_to_datetime(value).date().isoformat()
    except Exception:
        return value[:10]


def parse_message(message: dict[str, Any]) -> dict[str, Any] | None:
    sender = _clean(message.get("from", ""))
    subject = _clean(message.get("subject", ""))
    snippet = _clean(message.get("snippet", ""))
    labels = message.get("labels") or []
    hay = f"{sender} {subject} {snippet}".lower()

    if should_omit(sender, subject, snippet, labels):
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
        "lastTouch": normalize_date(message.get("date")),
        "nextStep": "Review thread / JD",
        "subject": subject,
        "url": "",
        "notes": snippet,
        "snippet": snippet,
    }
