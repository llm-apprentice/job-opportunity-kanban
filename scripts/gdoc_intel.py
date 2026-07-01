#!/usr/bin/env python3
"""Extract and reconcile interview-call intel from a Google Doc."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path
from typing import Any

from gmail_backfill import dedupe_by_company_keep_newest

GAPI = ["python", str(Path.home() / ".hermes/skills/productivity/google-workspace/scripts/google_api.py")]
DEFAULT_DOC_ID = "18gDt1KVMPnONbrQdZ_ulOMBecA11_VfiDI1mYasVcDw"

ROLE_HINTS = [
    "Head of Marketing",
    "Head of Growth",
    "Head of GTM",
    "Growth Marketing Lead",
    "Founding Growth Lead",
    "Growth Lead",
    "Lead Product Marketing Manager",
    "VP Marketing",
    "VP of Marketing",
    "Product Marketing Manager",
    "Founding Product Marketer",
]

STOP_WORDS = {
    "lance",
    "wills",
    "interview",
    "notes",
    "founder",
    "call",
    "screen",
    "recruiter",
    "role",
    "company",
    "next",
    "step",
    "marketing",
    "growth",
    "gtm",
    "head",
    "vp",
    "director",
    "manager",
    "lead",
    "team",
    "time",
    "today",
    "like",
    "remote",
    "product",
    "search",
    "req",
    "request",
    "san",
    "us",
    "ic",
    "role",
    "bonus",
}

FREE_EMAIL_DOMAINS = {"gmail", "googlemail", "yahoo", "hotmail", "outlook", "icloud", "me", "aol", "proton", "pm"}


def normalize_key(value: str) -> str:
    value = value.lower()
    value = re.sub(r"https?://", "", value)
    value = re.sub(r"\.(com|ai|dev|io|co|app)\b", "", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def titleish(value: str) -> str:
    value = re.sub(r"\s+", " ", value.strip(" -*•—–:/\t"))
    if not value:
        return value
    if value.isupper() or value.islower():
        return value.title()
    return value


def extract_role(text: str) -> str | None:
    cleaned = re.sub(r"\s+", " ", text)
    for hint in ROLE_HINTS:
        m = re.search(rf"\b({re.escape(hint)}[^\n\-—–|,:;]{{0,70}})", cleaned, re.I)
        if m:
            return titleish(m.group(1))[:90]
    return None


def _candidate_company(value: str) -> str | None:
    value = titleish(value)
    value = re.sub(r"\b(Inc|LLC|Ltd)\.?$", "", value).strip()
    words = normalize_key(value).split()
    if not words or any(w in STOP_WORDS for w in words[:1]):
        return None
    if len(value) < 2 or len(value) > 45:
        return None
    return value


def _add_alias(index: dict[str, Any], company: str, role: str | None, snippet: str, confidence: float = 0.86, aliases: list[str] | None = None):
    company = titleish(company)
    key = normalize_key(company)
    if not key:
        return
    entry = index["aliases"].setdefault(
        key,
        {
            "company": company,
            "role": role or "",
            "snippet": snippet.strip()[:500],
            "confidence": confidence,
        },
    )
    if role and not entry.get("role"):
        entry["role"] = role
    for alias in aliases or []:
        alias_key = normalize_key(alias)
        if alias_key and alias_key not in STOP_WORDS:
            index["aliases"].setdefault(alias_key, entry)


def _email_aliases(text: str) -> list[str]:
    aliases: list[str] = []
    for email in re.findall(r"[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})", text, flags=re.I):
        root = email.split(".")[0]
        if root.lower() not in FREE_EMAIL_DOMAINS:
            aliases.append(root)
    for name, email in re.findall(r"([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})\s*<([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>", text, flags=re.I):
        domain_root = email.split("@")[1].split(".")[0].lower()
        if domain_root not in FREE_EMAIL_DOMAINS:
            aliases.append(name)
    return aliases


def build_intel_index(doc_text: str, opportunity_hints: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Build a fuzzy lookup index from messy interview notes.

    Handles common note headings such as:
    - "Bitdrift - Head of Marketing"
    - "Paraform / Growth Marketing Lead"
    - "Company: Bitdrift" followed by "Role: Head of Marketing"
    """
    index: dict[str, Any] = {"aliases": {}, "source": "gdoc"}
    lines = [line.strip() for line in doc_text.splitlines()]
    nonempty = [line for line in lines if line]

    for i, line in enumerate(nonempty):
        window = "\n".join(nonempty[i : i + 5])

        explicit_company = re.search(r"\bCompany\s*[:\-]\s*([^\n|—–-]{2,45})", window, re.I)
        explicit_role = re.search(r"\bRole\s*[:\-]\s*([^\n|]{3,90})", window, re.I)
        if explicit_company:
            company = _candidate_company(explicit_company.group(1))
            if company:
                _add_alias(index, company, titleish(explicit_role.group(1)) if explicit_role else extract_role(window), window, 0.92, _email_aliases(window))

        # Heading pattern: "Company - Role" or "Company / Role"
        m = re.match(r"^([A-Z][A-Za-z0-9.& ]{1,44})\s*(?:[-—–/|:])\s*(.{3,100})$", line)
        if m:
            company = _candidate_company(m.group(1))
            role = extract_role(m.group(2))
            if company and role:
                _add_alias(index, company, role, window, 0.9, _email_aliases(window))

    if opportunity_hints:
        normalized_doc = normalize_key(doc_text)
        for opp in opportunity_hints:
            company = _candidate_company(str(opp.get("company", "")))
            if not company or company == "Unknown company":
                continue
            company_key = normalize_key(company)
            if len(company_key) < 4 or company_key not in normalized_doc:
                continue
            pos = normalized_doc.find(company_key)
            raw_pos = max(doc_text.lower().find(company.lower()[: min(len(company), 12)].lower()), 0)
            window = doc_text[max(0, raw_pos - 1200) : raw_pos + 1200]
            _add_alias(index, company, extract_role(window), window, 0.88, _email_aliases(window))

    return index


def _should_replace_company(opp: dict[str, Any]) -> bool:
    source = opp.get("companySource")
    if source == "manual":
        return False
    company = (opp.get("company") or "").strip()
    return not company or company == "Unknown company" or len(company) < 4


def _should_replace_role(opp: dict[str, Any]) -> bool:
    source = opp.get("roleSource")
    if source == "manual":
        return False
    role = (opp.get("role") or "").strip()
    if "Lance Wills" not in role and any(re.search(rf"\b{re.escape(hint)}\b", role, re.I) for hint in ROLE_HINTS):
        return False
    return (
        not role
        or role == "Unknown role"
        or len(role) > 80
        or "Lance Wills" in role
        or re.search(r"\b(intro|conversation|follow\s*up|call|chat)\b", role, re.I) is not None
    )


def reconcile_opportunity(opp: dict[str, Any], index: dict[str, Any]) -> dict[str, Any]:
    aliases = index.get("aliases", {})
    hay = normalize_key(" ".join(str(opp.get(k, "")) for k in ["company", "role", "subject", "notes", "snippet", "contact"]))
    subject_key = normalize_key(str(opp.get("subject", "")))
    contact = str(opp.get("contact", ""))
    contact_domains = {m.split(".")[0].lower() for m in re.findall(r"@([A-Z0-9.-]+\.[A-Z]{2,})", contact, flags=re.I)}
    best_key = ""
    best = None
    for key, entry in aliases.items():
        if len(key) < 4 or key in STOP_WORDS:
            continue
        if key and re.search(rf"\b{re.escape(key)}\b", hay):
            company_key = normalize_key(str(entry.get("company", "")))
            company_confirmed = (
                re.search(rf"\b{re.escape(company_key)}\b", subject_key) is not None
                or company_key in contact_domains
            )
            if not company_confirmed:
                continue
            if not best or len(key) > len(best_key):
                best_key = key
                best = entry

    if not best:
        return opp

    enriched = dict(opp)
    changed = False
    company_was_replaced = False
    if _should_replace_company(enriched):
        enriched["company"] = best["company"]
        enriched["companySource"] = "gdoc"
        changed = True
        company_was_replaced = True
    if company_was_replaced and best.get("role") and float(best.get("confidence", 0)) >= 0.85 and _should_replace_role(enriched):
        enriched["role"] = best["role"]
        enriched["roleSource"] = "gdoc"
        changed = True
    if not changed:
        return opp
    enriched["gdocMatched"] = True
    enriched["gdocSnippet"] = best.get("snippet", "")
    enriched["enrichmentConfidence"] = max(float(enriched.get("enrichmentConfidence", 0) or 0), float(best.get("confidence", 0.7)))
    return enriched


def fetch_gdoc_text(doc_id: str = DEFAULT_DOC_ID) -> str:
    p = subprocess.run(GAPI + ["docs", "get", doc_id], text=True, capture_output=True)
    if p.returncode:
        raise RuntimeError(p.stderr or p.stdout)
    data = json.loads(p.stdout)
    return data.get("body", "")


def enrich_opportunities(opportunities: list[dict[str, Any]], doc_text: str) -> list[dict[str, Any]]:
    index = build_intel_index(doc_text, opportunities)
    return dedupe_by_company_keep_newest([reconcile_opportunity(opp, index) for opp in opportunities])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--doc-id", default=DEFAULT_DOC_ID)
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()

    doc_text = fetch_gdoc_text(args.doc_id)
    opportunities = json.loads(Path(args.input).read_text())
    enriched = enrich_opportunities(opportunities, doc_text)
    Path(args.output).write_text(json.dumps(enriched, indent=2), encoding="utf-8")
    changed = sum(1 for before, after in zip(opportunities, enriched) if before != after)
    print(json.dumps({"input": len(opportunities), "changed": changed, "output": args.output}, indent=2))


if __name__ == "__main__":
    main()
