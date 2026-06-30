#!/usr/bin/env python3
"""Backfill job opportunities from Gmail search results.
Requires Hermes Google Workspace setup first. Writes private local data only.
"""
from __future__ import annotations
import argparse, json, re, subprocess
from datetime import date, timedelta
from pathlib import Path
LINKEDIN_PATTERNS=["linkedin","new message","sent you a message","inmail"]
JOB_PATTERNS=["opportunity","role","position","interview","recruiter","hiring","founder","screen","job","career"]
GAPI=["python",str(Path.home()/".hermes/skills/productivity/google-workspace/scripts/google_api.py")]
def run(cmd):
    p=subprocess.run(cmd,text=True,capture_output=True)
    if p.returncode: raise SystemExit(p.stderr or p.stdout)
    return json.loads(p.stdout)
def infer_company(sender,subject):
    m=re.search(r"@([A-Za-z0-9.-]+)",sender)
    if m:
        domain=m.group(1).split('.')[0]
        if domain not in {"linkedin","mail","gmail","google","notifications"}: return domain.replace('-',' ').title()
    m=re.search(r"(?:at|with)\s+([A-Z][A-Za-z0-9& .-]{2,40})",subject)
    return m.group(1).strip() if m else "Unknown company"
def infer_role(subject,snippet):
    text=f"{subject} {snippet}"
    m=re.search(r"(?:role|position|opportunity|opening)[:\s-]+([^|—–-]{4,80})",text,re.I)
    return m.group(1).strip() if m else (subject[:90] if subject else "Unknown role")
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--days',type=int,default=60); ap.add_argument('--out',default='data/opportunities.local.json'); ap.add_argument('--max',type=int,default=100); args=ap.parse_args()
    after=(date.today()-timedelta(days=args.days)).strftime('%Y/%m/%d')
    query=f'after:{after} (linkedin OR recruiter OR hiring OR opportunity OR interview OR founder OR "sent you a message")'
    msgs=run(GAPI+['gmail','search',query,'--max',str(args.max)])
    opps=[]; seen=set()
    for m in msgs:
        subj=m.get('subject','') or ''; snippet=m.get('snippet','') or ''; sender=m.get('from','') or ''; hay=f"{sender} {subj} {snippet}".lower()
        if not any(p in hay for p in JOB_PATTERNS+LINKEDIN_PATTERNS): continue
        key=(sender.lower(),subj.lower())
        if key in seen: continue
        seen.add(key); source='LinkedIn' if any(p in hay for p in LINKEDIN_PATTERNS) else 'Email'
        opps.append({'id':m.get('id'),'company':infer_company(sender,subj),'role':infer_role(subj,snippet),'stage':'New','source':source,'contact':sender,'priority':'Medium','lastTouch':(m.get('date','')[:10] if m.get('date') else ''),'nextStep':'Review thread / JD','subject':subj,'url':'','notes':snippet})
    out=Path(args.out); out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(opps,indent=2),encoding='utf-8'); print(f"Wrote {len(opps)} opportunities to {out}")
if __name__=='__main__': main()
