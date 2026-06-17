"""
services/external_intelligence.py
──────────────────────────────────
32 external-data capability engines for the Investor Readiness Report.

Organised into 4 groups:
  Group D — Document Intelligence   (9 capabilities)
  Group C — CRM / Investor Pipeline  (8 capabilities)
  Group F — Financial Intelligence   (8 capabilities)
  Group S — Strategic Intelligence   (7 capabilities)

Each engine:
  - Accepts an ExternalDataRequest + resolved file texts (Dict[file_id → text])
  - Returns a CapabilityResult with score, confidence, evidence, limitations
  - NEVER fabricates data — if inputs are missing, score=0 and limitations are listed

Total report capabilities after this module: 7 (survey) + 12 (hybrid) + 32 (external) = 51
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from schemas.external_data import ExternalDataRequest
from services.survey_intelligence import CapabilityResult, EvidenceStatement


# ── Helpers ───────────────────────────────────────────────────────────────────


def _evidence(category: str, statement: str, data_point: str, source: str, n: int = 1) -> EvidenceStatement:
    return EvidenceStatement(
        category=category,
        statement=statement,
        data_point=data_point,
        source_question=source,
        sample_size=n,
    )


def _cap(
    name: str,
    score: int,
    confidence: str,
    evidence: List[EvidenceStatement],
    metrics: Dict[str, Any],
    limitations: List[str],
    coverage: float,
) -> CapabilityResult:
    return CapabilityResult(
        capability_name=name,
        score=max(0, min(100, score)),
        confidence=confidence,
        evidence_count=len(evidence),
        data_coverage=min(1.0, coverage),
        evidence_statements=evidence,
        raw_metrics=metrics,
        limitations=limitations,
    )


def _parse_amount(text: str) -> Optional[float]:
    """Extract numeric value from currency strings like ₹3,00,000 → 300000."""
    if not text:
        return None
    cleaned = re.sub(r"[₹$€£,\s]", "", text)
    cleaned = re.sub(r"[A-Za-z]+", "", cleaned)
    m = re.search(r"\d+\.?\d*", cleaned)
    return float(m.group()) if m else None


def _conf(data_points: int) -> str:
    if data_points >= 5:
        return "high"
    if data_points >= 2:
        return "medium"
    return "low"


# ════════════════════════════════════════════════════════════════════
# GROUP D — Document Intelligence (9 capabilities)
# ════════════════════════════════════════════════════════════════════


def build_pitch_deck_analysis(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """D1 — Pitch Deck Analysis: AI-ready deck quality dimensions."""
    ev, lim, dp = [], [], 0

    d = ext.pitch_deck
    if not d or not d.file_id:
        lim.append("No pitch deck uploaded — upload a PDF to get deck quality analysis.")
        return _cap("pitch_deck_analysis", 0, "low", ev, {}, lim, 0.0)

    text = file_texts.get(d.file_id, "")
    if text:
        words = len(text.split())
        ev.append(
            _evidence(
                "pitch_deck",
                f"Deck text extracted: {words} words from uploaded PDF",
                f"{words} words",
                "Pitch deck upload",
                1,
            )
        )
        dp += 1

        # Dimension scoring from text presence
        dimensions = {
            "problem": ["problem", "pain", "challenge", "struggle"],
            "solution": ["solution", "product", "platform", "tool"],
            "market": ["market", "tam", "sam", "som", "billion", "million"],
            "traction": ["traction", "customers", "users", "revenue", "growth", "mrr"],
            "team": ["team", "founder", "ceo", "cto", "experience", "background"],
            "financials": ["projection", "forecast", "revenue", "burn", "runway", "ebitda"],
            "ask": ["raise", "raising", "funding", "investment", "round", "seed"],
            "competitive": ["competition", "competitor", "alternative", "differentiat"],
            "roadmap": ["roadmap", "plan", "milestone", "q1", "q2", "year 1"],
            "business_model": ["pricing", "subscription", "saas", "revenue model"],
        }
        text_lower = text.lower()
        covered = [d for d, kws in dimensions.items() if any(kw in text_lower for kw in kws)]
        score_from_text = int(len(covered) / len(dimensions) * 70) + 10
        ev.append(
            _evidence(
                "pitch_deck",
                f"Deck covers {len(covered)}/10 key investor sections: {', '.join(covered)}",
                f"{len(covered)}/10 sections",
                "Content analysis",
                1,
            )
        )
        dp += 1
    else:
        score_from_text = 20
        lim.append("Deck uploaded but text could not be extracted — ensure PDF has selectable text.")

    if d.slide_count:
        optimal = 10 <= d.slide_count <= 15
        ev.append(
            _evidence(
                "pitch_deck",
                f"Slide count: {d.slide_count} ({'optimal' if optimal else 'review length'})",
                str(d.slide_count),
                "Deck metadata",
                1,
            )
        )
        dp += 1

    if d.deck_version:
        ev.append(_evidence("pitch_deck", f"Deck version: {d.deck_version}", d.deck_version, "Deck metadata", 1))
        dp += 1

    score = score_from_text
    return _cap(
        "pitch_deck_analysis",
        score,
        _conf(dp),
        ev,
        {
            "slide_count": d.slide_count,
            "version": d.deck_version,
            "sections_covered": covered if text else [],
            "text_length": len(text),
        },
        lim,
        dp / 4,
    )


def build_term_sheet_analysis(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """D2 — Term Sheet Analyzer: extracts key terms, flags risks."""
    ev, lim, dp = [], [], 0
    t = ext.term_sheet

    if not t:
        lim.append("No term sheet data provided — enter term sheet details to analyse terms.")
        return _cap("term_sheet_analysis", 0, "low", ev, {}, lim, 0.0)

    red_flags = []

    if t.investment_amount:
        ev.append(
            _evidence(
                "term_sheet",
                f"Investment amount: {t.investment_amount}",
                t.investment_amount,
                "term_sheet.investment_amount",
                1,
            )
        )
        dp += 1

    if t.pre_money_valuation:
        ev.append(
            _evidence(
                "term_sheet",
                f"Pre-money valuation: {t.pre_money_valuation}",
                t.pre_money_valuation,
                "term_sheet.pre_money_valuation",
                1,
            )
        )
        dp += 1

    if t.equity_offered is not None:
        if t.equity_offered > 25:
            red_flags.append(f"High dilution: {t.equity_offered}% offered (>25% is aggressive for this stage)")
        ev.append(
            _evidence(
                "term_sheet",
                f"Equity offered: {t.equity_offered}% — {'⚠ High dilution' if t.equity_offered > 25 else 'Reasonable'}",
                f"{t.equity_offered}%",
                "term_sheet.equity_offered",
                1,
            )
        )
        dp += 1

    if t.lead_investor:
        ev.append(
            _evidence("term_sheet", f"Lead investor: {t.lead_investor}", t.lead_investor, "term_sheet.lead_investor", 1)
        )
        dp += 1

    if t.term_sheet_stage:
        stage_scores = {"LOI": 50, "Draft": 60, "Final": 80, "Signed": 100}
        stage_score = stage_scores.get(t.term_sheet_stage, 40)
        ev.append(
            _evidence(
                "term_sheet",
                f"Term sheet stage: {t.term_sheet_stage} → {stage_score}/100 maturity",
                t.term_sheet_stage,
                "term_sheet.stage",
                1,
            )
        )
        dp += 1

    # Analyse document text if uploaded
    text = file_texts.get(t.file_id, "") if t.file_id else ""
    if text:
        risky_terms = [
            "full ratchet",
            "anti-dilution",
            "participating preferred",
            "drag-along",
            "liquidation preference 2x",
            "super pro-rata",
        ]
        found_risks = [term for term in risky_terms if term.lower() in text.lower()]
        if found_risks:
            red_flags.extend([f"Risky term found: '{t}'" for t in found_risks])
        ev.append(
            _evidence(
                "term_sheet",
                f"Document analysed: {len(text.split())} words extracted",
                f"{len(found_risks)} risks flagged",
                "Uploaded term sheet",
                1,
            )
        )
        dp += 1

    score = min(100, dp * 15 + (20 if not red_flags else 0))
    return _cap(
        "term_sheet_analysis",
        score,
        _conf(dp),
        ev,
        {"red_flags": red_flags, "stage": t.term_sheet_stage if t else None},
        lim,
        dp / 6,
    )


def build_financial_model_review(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """D3 — Financial Model Review: validates assumptions and projections."""
    ev, lim, dp = [], [], 0
    f = ext.financial_model

    if not f:
        lim.append("No financial model provided — upload a financial model PDF for review.")
        return _cap("financial_model_review", 0, "low", ev, {}, lim, 0.0)

    issues = []

    if f.projection_years:
        ev.append(
            _evidence(
                "financial_model",
                f"Projections cover {f.projection_years} years",
                f"{f.projection_years} years",
                "financial_model.projection_years",
                1,
            )
        )
        dp += 1

    y1 = _parse_amount(f.year1_revenue) if f.year1_revenue else None
    y3 = _parse_amount(f.year3_revenue) if f.year3_revenue else None

    if y1:
        ev.append(
            _evidence(
                "financial_model",
                f"Year-1 revenue projection: {f.year1_revenue}",
                f.year1_revenue,
                "financial_model.year1_revenue",
                1,
            )
        )
        dp += 1
    if y3:
        ev.append(
            _evidence(
                "financial_model",
                f"Year-3 revenue projection: {f.year3_revenue}",
                f.year3_revenue,
                "financial_model.year3_revenue",
                1,
            )
        )
        dp += 1
        if y1 and y3:
            growth_x = y3 / max(y1, 1)
            if growth_x > 50:
                issues.append(f"Aggressive growth assumption: {growth_x:.0f}x from Y1 to Y3")
            ev.append(
                _evidence(
                    "financial_model",
                    f"Revenue growth Y1→Y3: {growth_x:.1f}x",
                    f"{growth_x:.1f}x",
                    "Derived projection",
                    1,
                )
            )

    if f.break_even_month:
        ev.append(
            _evidence(
                "financial_model",
                f"Break-even projected at month {f.break_even_month}",
                f"Month {f.break_even_month}",
                "financial_model.break_even_month",
                1,
            )
        )
        dp += 1

    if f.assumptions_documented is not None:
        if not f.assumptions_documented:
            issues.append("Assumptions not documented — investors expect documented assumptions")
        ev.append(
            _evidence(
                "financial_model",
                f"Assumptions documented: {'Yes' if f.assumptions_documented else 'No ⚠'}",
                str(f.assumptions_documented),
                "financial_model.assumptions_documented",
                1,
            )
        )
        dp += 1

    text = file_texts.get(f.file_id, "") if f.file_id else ""
    if text:
        ev.append(
            _evidence(
                "financial_model",
                f"Financial document text extracted: {len(text.split())} words",
                f"{len(text.split())} words",
                "Uploaded financial model",
                1,
            )
        )
        dp += 1

    score = min(100, dp * 15 + (10 if not issues else 0))
    return _cap(
        "financial_model_review",
        score,
        _conf(dp),
        ev,
        {"issues": issues, "growth_multiple": round(y3 / max(y1, 1), 1) if y1 and y3 else None},
        lim,
        dp / 6,
    )


def build_due_diligence_readiness(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """D4 — Due Diligence Readiness: document checklist completion score."""
    ev, lim, dp = [], [], 0
    d = ext.due_diligence

    if not d:
        lim.append("No due diligence checklist provided — complete the DD checklist to assess readiness.")
        return _cap("due_diligence_readiness", 0, "low", ev, {}, lim, 0.0)

    items = {
        "Incorporation documents": d.incorporation_docs,
        "Current cap table": d.cap_table_current,
        "Audited financials": d.audited_financials,
        "IP assignments": d.ip_assignments,
        "Customer contracts": d.customer_contracts,
        "Employment agreements": d.employment_agreements,
        "Board resolutions": d.board_resolutions,
        "6-month bank statements": d.bank_statements_6m,
        "Tax returns": d.tax_returns,
        "Regulatory filings": d.regulatory_filings,
        "Founder backgrounds": d.founder_backgrounds,
        "Reference checks": d.reference_checks_done,
    }

    filled = {k: v for k, v in items.items() if v is not None}
    completed = [k for k, v in filled.items() if v]
    missing = [k for k, v in filled.items() if not v]
    dp = len(filled)

    score = int(len(completed) / len(items) * 100)

    ev.append(
        _evidence(
            "due_diligence",
            f"DD checklist: {len(completed)}/{len(items)} items ready",
            f"{len(completed)}/{len(items)}",
            "Due diligence checklist",
            len(filled),
        )
    )
    if completed:
        ev.append(
            _evidence(
                "due_diligence",
                f"Ready: {', '.join(completed[:5])}{'...' if len(completed) > 5 else ''}",
                f"{len(completed)} docs",
                "DD checklist",
                1,
            )
        )
    if missing:
        for m in missing[:3]:
            lim.append(f"Missing DD document: {m}")

    return _cap(
        "due_diligence_readiness",
        score,
        _conf(dp),
        ev,
        {"completed": completed, "missing": missing, "total_items": len(items)},
        lim,
        len(filled) / len(items),
    )


def build_data_room_audit(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """D5 — Data Room Audit: completeness and investor-readiness of data room."""
    ev, lim, dp = [], [], 0
    d = ext.data_room

    if not d:
        lim.append("No data room information provided.")
        return _cap("data_room_audit", 0, "low", ev, {}, lim, 0.0)

    if d.data_room_link:
        ev.append(
            _evidence("data_room", f"Data room accessible at: {d.data_room_link}", "Link provided", "data_room.link", 1)
        )
        dp += 1

    if d.total_documents:
        quality = "strong" if d.total_documents >= 20 else "adequate" if d.total_documents >= 10 else "thin"
        ev.append(
            _evidence(
                "data_room",
                f"Total documents: {d.total_documents} ({quality})",
                str(d.total_documents),
                "data_room.total_documents",
                1,
            )
        )
        dp += 1

    if d.sections_complete:
        ev.append(
            _evidence(
                "data_room",
                f"Sections complete: {', '.join(d.sections_complete)}",
                f"{len(d.sections_complete)} sections",
                "data_room.sections_complete",
                len(d.sections_complete),
            )
        )
        dp += 1

    if d.last_updated:
        ev.append(
            _evidence("data_room", f"Last updated: {d.last_updated}", d.last_updated, "data_room.last_updated", 1)
        )
        dp += 1

    score = min(100, dp * 20 + (d.total_documents or 0))
    return _cap(
        "data_room_audit",
        score,
        _conf(dp),
        ev,
        {"link": d.data_room_link, "docs": d.total_documents, "sections": d.sections_complete},
        lim,
        dp / 4,
    )


def build_one_pager_review(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """D6 — One-Pager Generator Inputs: quality of one-pager content."""
    ev, lim, dp = [], [], 0
    o = ext.one_pager

    if not o or not o.file_id:
        lim.append("No one-pager uploaded — upload a one-pager PDF for review.")
        return _cap("one_pager_review", 0, "low", ev, {}, lim, 0.0)

    text = file_texts.get(o.file_id, "")
    if text:
        words = len(text.split())
        ev.append(
            _evidence("one_pager", f"One-pager text extracted: {words} words", f"{words} words", "One-pager upload", 1)
        )
        # Good one-pager: 150-400 words
        if words < 100:
            lim.append("One-pager appears very short — ensure key sections are included.")
        elif words > 600:
            lim.append("One-pager may be too long — target 200-400 words for investor attention.")
        dp += 1
        score = 60 + min(30, int(words / 10))
    else:
        score = 20
        lim.append("Could not extract text from uploaded one-pager.")

    if o.target_audience:
        ev.append(
            _evidence(
                "one_pager", f"Target audience: {o.target_audience}", o.target_audience, "one_pager.target_audience", 1
            )
        )
        dp += 1

    return _cap(
        "one_pager_review",
        score,
        _conf(dp),
        ev,
        {"words": len(text.split()) if text else 0, "target_audience": o.target_audience},
        lim,
        dp / 2,
    )


def build_reference_letter_quality(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """D7 — Reference Letter Tracker: credibility and strength of references."""
    ev, lim, dp = [], [], 0
    r = ext.reference_letters

    if not r:
        lim.append("No reference letters provided.")
        return _cap("reference_letter_quality", 0, "low", ev, {}, lim, 0.0)

    if r.reference_count:
        quality = "strong" if r.reference_count >= 3 else "minimal"
        ev.append(
            _evidence(
                "references",
                f"{r.reference_count} references available ({quality})",
                str(r.reference_count),
                "reference_letters.count",
                1,
            )
        )
        dp += 1

    if r.reference_types:
        ev.append(
            _evidence(
                "references",
                f"Reference types: {', '.join(r.reference_types)}",
                ", ".join(r.reference_types),
                "reference_letters.types",
                len(r.reference_types),
            )
        )
        dp += 1

    letter_texts = []
    for fid in r.file_ids or []:
        text = file_texts.get(fid, "")
        if text:
            letter_texts.append(text)
            dp += 1

    if letter_texts:
        ev.append(
            _evidence(
                "references",
                f"{len(letter_texts)} reference letter(s) text extracted",
                f"{len(letter_texts)} letters",
                "Uploaded letters",
                len(letter_texts),
            )
        )

    score = min(100, (r.reference_count or 0) * 20 + len(letter_texts) * 15)
    return _cap(
        "reference_letter_quality",
        score,
        _conf(dp),
        ev,
        {"count": r.reference_count, "types": r.reference_types, "letters_analysed": len(letter_texts)},
        lim,
        min(1.0, dp / 4),
    )


def build_legal_status_check(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """D8 — Legal Document Status: IP, NDA, compliance health."""
    ev, lim, dp = [], [], 0
    legal = ext.legal_status
    risks = []

    if not legal:
        lim.append("No legal status information provided.")
        return _cap("legal_status_check", 0, "low", ev, {}, lim, 0.0)

    if legal.nda_template_ready is not None:
        if not legal.nda_template_ready:
            risks.append("No NDA template ready — required before investor data sharing")
        ev.append(
            _evidence(
                "legal",
                f"NDA template: {'Ready ✓' if legal.nda_template_ready else 'Not ready ⚠'}",
                str(legal.nda_template_ready),
                "legal_status.nda",
                1,
            )
        )
        dp += 1

    if legal.ip_ownership_clear is not None:
        if not legal.ip_ownership_clear:
            risks.append("IP ownership unclear — major DD red flag for investors")
        ev.append(
            _evidence(
                "legal",
                f"IP ownership: {'Clear ✓' if legal.ip_ownership_clear else 'Unclear ⚠ — critical issue'}",
                str(legal.ip_ownership_clear),
                "legal_status.ip",
                1,
            )
        )
        dp += 1

    if legal.no_pending_litigation is not None:
        if not legal.no_pending_litigation:
            risks.append("Pending litigation — investors will require full disclosure")
        ev.append(
            _evidence(
                "legal",
                f"Litigation status: {'Clean ✓' if legal.no_pending_litigation else 'Pending litigation ⚠'}",
                str(legal.no_pending_litigation),
                "legal_status.litigation",
                1,
            )
        )
        dp += 1

    if legal.compliance_status:
        ev.append(
            _evidence(
                "legal",
                f"Compliance status: {legal.compliance_status}",
                legal.compliance_status,
                "legal_status.compliance",
                1,
            )
        )
        dp += 1

    if legal.trademarks_filed is not None:
        ev.append(
            _evidence(
                "legal",
                f"Trademarks: {'Filed ✓' if legal.trademarks_filed else 'Not filed'}",
                str(legal.trademarks_filed),
                "legal_status.trademarks",
                1,
            )
        )
        dp += 1

    if legal.patents_filed:
        ev.append(
            _evidence(
                "legal", f"Patents filed: {legal.patents_filed}", str(legal.patents_filed), "legal_status.patents", 1
            )
        )
        dp += 1

    score = max(0, min(100, dp * 15 - len(risks) * 20 + 10))
    return _cap(
        "legal_status_check",
        score,
        _conf(dp),
        ev,
        {"risks": risks, "patents_filed": legal.patents_filed, "compliance": legal.compliance_status},
        lim,
        dp / 6,
    )


def build_media_kit_review(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """D9 — Press/Media Kit Review: brand credibility and press presence."""
    ev, lim, dp = [], [], 0
    m = ext.media_kit

    if not m:
        lim.append("No media kit information provided.")
        return _cap("media_kit_review", 0, "low", ev, {}, lim, 0.0)

    if m.press_mentions:
        tier = "strong" if m.press_mentions >= 5 else "moderate" if m.press_mentions >= 2 else "early"
        ev.append(
            _evidence(
                "media",
                f"Press mentions: {m.press_mentions} ({tier} press presence)",
                str(m.press_mentions),
                "media_kit.press_mentions",
                1,
            )
        )
        dp += 1

    if m.press_outlets:
        ev.append(
            _evidence(
                "media",
                f"Featured in: {', '.join(m.press_outlets[:5])}",
                f"{len(m.press_outlets)} outlets",
                "media_kit.press_outlets",
                len(m.press_outlets),
            )
        )
        dp += 1

    if m.social_followers:
        total = sum(m.social_followers.values())
        ev.append(
            _evidence(
                "media",
                f"Social media reach: {total:,} total followers across {len(m.social_followers)} platforms",
                f"{total:,} followers",
                "media_kit.social_followers",
                1,
            )
        )
        dp += 1

    text = file_texts.get(m.file_id, "") if m.file_id else ""
    if text:
        ev.append(
            _evidence(
                "media",
                f"Media kit document: {len(text.split())} words extracted",
                f"{len(text.split())} words",
                "media_kit upload",
                1,
            )
        )
        dp += 1

    score = min(100, (m.press_mentions or 0) * 8 + dp * 10)
    return _cap(
        "media_kit_review",
        score,
        _conf(dp),
        ev,
        {
            "press_mentions": m.press_mentions,
            "outlets": m.press_outlets,
            "social_reach": sum(m.social_followers.values()) if m.social_followers else 0,
        },
        lim,
        dp / 4,
    )


# ════════════════════════════════════════════════════════════════════
# GROUP C — CRM / Investor Pipeline (8 capabilities)
# ════════════════════════════════════════════════════════════════════


def build_investor_pipeline_tracker(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """C1 — Investor Pipeline Tracker: pipeline health and velocity."""
    ev, lim, dp = [], [], 0
    p = ext.investor_pipeline

    if not p:
        lim.append("No investor pipeline data provided.")
        return _cap("investor_pipeline_tracker", 0, "low", ev, {}, lim, 0.0)

    if p.total_targeted:
        ev.append(
            _evidence(
                "pipeline",
                f"Total investors in outreach list: {p.total_targeted}",
                str(p.total_targeted),
                "investor_pipeline.total_targeted",
                1,
            )
        )
        dp += 1

    if p.meetings_held:
        conversion = round(p.meetings_held / max(p.total_targeted or 1, 1) * 100, 1)
        ev.append(
            _evidence(
                "pipeline",
                f"Meetings held: {p.meetings_held} ({conversion}% outreach-to-meeting rate)",
                str(p.meetings_held),
                "investor_pipeline.meetings_held",
                1,
            )
        )
        dp += 1

    if p.term_sheets_received:
        ev.append(
            _evidence(
                "pipeline",
                f"Term sheets received: {p.term_sheets_received}",
                str(p.term_sheets_received),
                "investor_pipeline.term_sheets",
                1,
            )
        )
        dp += 1

    if p.soft_commits:
        ev.append(
            _evidence(
                "pipeline",
                f"Soft commitments: {p.soft_commits}",
                str(p.soft_commits),
                "investor_pipeline.soft_commits",
                1,
            )
        )
        dp += 1

    contacts = p.contacts or []
    if contacts:
        by_stage: Dict[str, int] = {}
        for c in contacts:
            by_stage[c.stage or "Unknown"] = by_stage.get(c.stage or "Unknown", 0) + 1
        ev.append(
            _evidence(
                "pipeline",
                f"Pipeline breakdown: {dict(sorted(by_stage.items()))}",
                f"{len(contacts)} contacts",
                "investor_pipeline.contacts",
                len(contacts),
            )
        )
        dp += 1

    score = min(100, dp * 15 + (p.term_sheets_received or 0) * 20 + (p.soft_commits or 0) * 10)
    return _cap(
        "investor_pipeline_tracker",
        score,
        _conf(dp),
        ev,
        {
            "total_targeted": p.total_targeted,
            "meetings_held": p.meetings_held,
            "term_sheets": p.term_sheets_received,
            "soft_commits": p.soft_commits,
            "contacts_count": len(contacts),
        },
        lim,
        dp / 5,
    )


def build_investor_meeting_prep(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """C2 — Investor Meeting Prep: targeted prep intelligence for next meeting."""
    ev, lim, dp = [], [], 0
    m = ext.meeting_prep

    if not m:
        lim.append("No meeting prep data provided — add next investor details for targeted prep.")
        return _cap("investor_meeting_prep", 0, "low", ev, {}, lim, 0.0)

    if m.next_meeting_investor:
        ev.append(
            _evidence(
                "meeting_prep",
                f"Next meeting with: {m.next_meeting_investor} ({m.next_meeting_firm or 'firm TBD'})",
                m.next_meeting_investor,
                "meeting_prep.investor",
                1,
            )
        )
        dp += 1

    if m.investor_focus_areas:
        ev.append(
            _evidence(
                "meeting_prep",
                f"Investor focus areas: {', '.join(m.investor_focus_areas)}",
                ", ".join(m.investor_focus_areas),
                "meeting_prep.focus_areas",
                len(m.investor_focus_areas),
            )
        )
        dp += 1

    if m.investor_portfolio:
        ev.append(
            _evidence(
                "meeting_prep",
                f"Known portfolio: {', '.join(m.investor_portfolio[:5])}",
                f"{len(m.investor_portfolio)} companies",
                "meeting_prep.portfolio",
                len(m.investor_portfolio),
            )
        )
        dp += 1

    if m.previous_feedback:
        ev.append(
            _evidence(
                "meeting_prep",
                f"Previous pitch feedback: {m.previous_feedback[:120]}",
                "Feedback provided",
                "meeting_prep.feedback",
                1,
            )
        )
        dp += 1

    score = min(100, dp * 22 + 10)
    return _cap(
        "investor_meeting_prep",
        score,
        _conf(dp),
        ev,
        {
            "investor": m.next_meeting_investor,
            "firm": m.next_meeting_firm,
            "focus_areas": m.investor_focus_areas,
            "portfolio": m.investor_portfolio,
        },
        lim,
        dp / 4,
    )


def build_investor_type_matching(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """C3 — Angel vs VC Matching: optimal investor type recommendation."""
    ev, lim, dp = [], [], 0
    m = ext.investor_matching

    if not m:
        lim.append("No investor matching preferences provided.")
        return _cap("investor_type_matching", 0, "low", ev, {}, lim, 0.0)

    if m.preferred_investor_type:
        ev.append(
            _evidence(
                "matching",
                f"Preferred investor type: {m.preferred_investor_type}",
                m.preferred_investor_type,
                "investor_matching.type",
                1,
            )
        )
        dp += 1

    if m.check_size_min or m.check_size_max:
        range_str = f"{m.check_size_min or 'Any'} – {m.check_size_max or 'Any'}"
        ev.append(
            _evidence("matching", f"Target check size range: {range_str}", range_str, "investor_matching.check_size", 1)
        )
        dp += 1

    if m.board_seat_acceptable is not None:
        ev.append(
            _evidence(
                "matching",
                f"Board seat: {'Acceptable' if m.board_seat_acceptable else 'Prefer no board seat'}",
                str(m.board_seat_acceptable),
                "investor_matching.board_seat",
                1,
            )
        )
        dp += 1

    if m.looking_for_smart_money is not None:
        ev.append(
            _evidence(
                "matching",
                f"Smart money priority: {'Yes — seeking operational expertise' if m.looking_for_smart_money else 'Capital only'}",
                str(m.looking_for_smart_money),
                "investor_matching.smart_money",
                1,
            )
        )
        dp += 1

    score = min(100, dp * 22 + 10)
    return _cap(
        "investor_type_matching",
        score,
        _conf(dp),
        ev,
        {
            "preferred_type": m.preferred_investor_type,
            "check_size_min": m.check_size_min,
            "board_acceptable": m.board_seat_acceptable,
            "smart_money": m.looking_for_smart_money,
        },
        lim,
        dp / 4,
    )


def build_vc_firm_targeting(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """C4 — VC Firm Targeting: specific firm + partner strategy."""
    ev, lim, dp = [], [], 0
    v = ext.vc_targeting

    if not v:
        lim.append("No VC targeting data provided.")
        return _cap("vc_firm_targeting", 0, "low", ev, {}, lim, 0.0)

    if v.target_vcs:
        ev.append(
            _evidence(
                "vc_targeting",
                f"Target VC firms: {', '.join(v.target_vcs[:6])}",
                f"{len(v.target_vcs)} firms",
                "vc_targeting.target_vcs",
                len(v.target_vcs),
            )
        )
        dp += 1

    if v.warm_intros_available:
        ev.append(
            _evidence(
                "vc_targeting",
                f"Warm introductions available: {v.warm_intros_available}",
                str(v.warm_intros_available),
                "vc_targeting.warm_intros",
                1,
            )
        )
        dp += 1

    if v.cold_outreach_done:
        ev.append(
            _evidence(
                "vc_targeting",
                f"Cold outreach attempts: {v.cold_outreach_done}",
                str(v.cold_outreach_done),
                "vc_targeting.cold_outreach",
                1,
            )
        )
        dp += 1

    if v.accelerator_backed is not None:
        ev.append(
            _evidence(
                "vc_targeting",
                f"Accelerator: {'Backed by ' + (v.accelerator_name or 'accelerator') if v.accelerator_backed else 'Not accelerator-backed'}",
                str(v.accelerator_backed),
                "vc_targeting.accelerator",
                1,
            )
        )
        dp += 1

    score = min(100, (len(v.target_vcs or []) * 5) + (v.warm_intros_available or 0) * 10 + dp * 10)
    return _cap(
        "vc_firm_targeting",
        score,
        _conf(dp),
        ev,
        {"firms": v.target_vcs, "warm_intros": v.warm_intros_available, "accelerator": v.accelerator_name},
        lim,
        dp / 4,
    )


def build_pitch_feedback_analysis(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """C5 — Pitch Feedback Aggregator: pattern analysis of received feedback."""
    ev, lim, dp = [], [], 0
    f = ext.pitch_feedback

    if not f:
        lim.append("No pitch feedback data provided.")
        return _cap("pitch_feedback_analysis", 0, "low", ev, {}, lim, 0.0)

    if f.pitches_completed:
        ev.append(
            _evidence(
                "pitch_feedback",
                f"Pitches completed: {f.pitches_completed}",
                str(f.pitches_completed),
                "pitch_feedback.pitches_completed",
                1,
            )
        )
        dp += 1

    if f.common_objections:
        ev.append(
            _evidence(
                "pitch_feedback",
                f"Common objections heard: {', '.join(f.common_objections[:3])}",
                f"{len(f.common_objections)} objections",
                "pitch_feedback.objections",
                len(f.common_objections),
            )
        )
        dp += 1

    if f.positive_signals:
        ev.append(
            _evidence(
                "pitch_feedback",
                f"Consistent positives: {', '.join(f.positive_signals[:3])}",
                f"{len(f.positive_signals)} signals",
                "pitch_feedback.positives",
                len(f.positive_signals),
            )
        )
        dp += 1

    if f.pivot_suggestions:
        ev.append(
            _evidence(
                "pitch_feedback",
                f"Pivot suggestions received: {', '.join(f.pivot_suggestions[:2])}",
                f"{len(f.pivot_suggestions)} suggestions",
                "pitch_feedback.pivots",
                len(f.pivot_suggestions),
            )
        )
        dp += 1
        lim.append(f"Multiple investors suggested pivots: {', '.join(f.pivot_suggestions[:2])} — review positioning")

    score = min(100, (f.pitches_completed or 0) * 5 + dp * 15)
    return _cap(
        "pitch_feedback_analysis",
        score,
        _conf(dp),
        ev,
        {
            "pitches": f.pitches_completed,
            "objections": f.common_objections,
            "positives": f.positive_signals,
            "pivot_suggestions": f.pivot_suggestions,
        },
        lim,
        dp / 4,
    )


def build_portfolio_fit_analysis(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """C6 — Portfolio Fit Analysis: alignment with target investor portfolios."""
    ev, lim, dp = [], [], 0
    v = ext.vc_targeting
    m = ext.meeting_prep

    if not v and not m:
        lim.append("No VC targeting or meeting prep data to assess portfolio fit.")
        return _cap("portfolio_fit_analysis", 0, "low", ev, {}, lim, 0.0)

    if m and m.investor_portfolio:
        ev.append(
            _evidence(
                "portfolio_fit",
                f"Investor portfolio analysed: {len(m.investor_portfolio)} known portfolio companies",
                f"{len(m.investor_portfolio)} companies",
                "meeting_prep.portfolio",
                len(m.investor_portfolio),
            )
        )
        dp += 1

    if m and m.investor_focus_areas:
        ev.append(
            _evidence(
                "portfolio_fit",
                f"Investor focus themes: {', '.join(m.investor_focus_areas)}",
                ", ".join(m.investor_focus_areas),
                "meeting_prep.focus_areas",
                1,
            )
        )
        dp += 1

    if v and v.target_vcs:
        ev.append(
            _evidence(
                "portfolio_fit",
                f"Targeting {len(v.target_vcs)} VC firms for portfolio fit matching",
                f"{len(v.target_vcs)} firms",
                "vc_targeting.target_vcs",
                1,
            )
        )
        dp += 1

    score = min(100, dp * 28 + 15)
    return _cap(
        "portfolio_fit_analysis",
        score,
        _conf(dp),
        ev,
        {
            "portfolio_companies": m.investor_portfolio if m else None,
            "focus_areas": m.investor_focus_areas if m else None,
        },
        lim,
        dp / 3,
    )


def build_objection_response_library(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """C7+C8 — Objection Response Library: custom objection + response mapping."""
    ev, lim, dp = [], [], 0
    o = ext.objection_library
    f = ext.pitch_feedback

    objections_available = []

    if o and o.custom_objections:
        objections_available.extend(o.custom_objections)
        ev.append(
            _evidence(
                "objections",
                f"Custom objection-response pairs: {len(o.custom_objections)}",
                f"{len(o.custom_objections)} pairs",
                "objection_library",
                len(o.custom_objections),
            )
        )
        dp += 1

    if f and f.common_objections:
        for obj in f.common_objections:
            objections_available.append({"objection": obj, "response": "Pending — AI will generate response"})
        ev.append(
            _evidence(
                "objections",
                f"Objections from pitch feedback: {', '.join(f.common_objections[:3])}",
                f"{len(f.common_objections)} objections",
                "pitch_feedback",
                len(f.common_objections),
            )
        )
        dp += 1

    score = min(100, len(objections_available) * 10 + dp * 15)
    return _cap(
        "objection_response_library",
        score,
        _conf(dp),
        ev,
        {"total_objections": len(objections_available), "objections": objections_available[:5]},
        lim,
        dp / 2,
    )


# ════════════════════════════════════════════════════════════════════
# GROUP F — Financial Intelligence (8 capabilities)
# ════════════════════════════════════════════════════════════════════


def build_burn_runway_analysis(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """F1 — Burn Rate & Runway Calculator."""
    ev, lim, dp = [], [], 0
    b = ext.burn_runway

    if not b:
        lim.append("No burn rate / runway data provided.")
        return _cap("burn_runway_analysis", 0, "low", ev, {}, lim, 0.0)

    burn = _parse_amount(b.monthly_burn_rate) if b.monthly_burn_rate else None
    cash = _parse_amount(b.cash_in_bank) if b.cash_in_bank else None
    mrr = _parse_amount(b.monthly_revenue) if b.monthly_revenue else None

    if burn:
        ev.append(
            _evidence(
                "financials",
                f"Monthly burn rate: {b.monthly_burn_rate}",
                b.monthly_burn_rate,
                "burn_runway.monthly_burn_rate",
                1,
            )
        )
        dp += 1

    if cash:
        ev.append(
            _evidence("financials", f"Cash in bank: {b.cash_in_bank}", b.cash_in_bank, "burn_runway.cash_in_bank", 1)
        )
        dp += 1

    runway = None
    if burn and cash:
        net_burn = burn - (mrr or 0)
        if net_burn > 0:
            runway = round(cash / net_burn, 1)
            status = "critical" if runway < 6 else "tight" if runway < 12 else "healthy"
            ev.append(
                _evidence(
                    "financials",
                    f"Runway: {runway} months ({status})",
                    f"{runway} months",
                    "Computed: cash / net burn",
                    1,
                )
            )
            if status == "critical":
                lim.append(f"Critical runway: only {runway} months remaining — fundraise urgently")

    if mrr:
        ev.append(
            _evidence(
                "financials", f"Current MRR: {b.monthly_revenue}", b.monthly_revenue, "burn_runway.monthly_revenue", 1
            )
        )
        dp += 1

    if b.revenue_growth_mom:
        ev.append(
            _evidence(
                "financials",
                f"MoM revenue growth: {b.revenue_growth_mom}%",
                f"{b.revenue_growth_mom}%",
                "burn_runway.revenue_growth",
                1,
            )
        )
        dp += 1

    score = min(100, dp * 20 + (15 if runway and runway > 12 else 5 if runway else 0))
    return _cap(
        "burn_runway_analysis",
        score,
        _conf(dp),
        ev,
        {"burn": burn, "cash": cash, "runway_months": runway, "mrr": mrr},
        lim,
        dp / 4,
    )


def build_valuation_analysis(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """F2 — Valuation Calculator: comparable and revenue-multiple analysis."""
    ev, lim, dp = [], [], 0
    v = ext.valuation

    if not v:
        lim.append("No valuation data provided.")
        return _cap("valuation_analysis", 0, "low", ev, {}, lim, 0.0)

    if v.valuation_method:
        ev.append(
            _evidence("valuation", f"Valuation method: {v.valuation_method}", v.valuation_method, "valuation.method", 1)
        )
        dp += 1

    if v.target_pre_money:
        ev.append(
            _evidence(
                "valuation",
                f"Target pre-money valuation: {v.target_pre_money}",
                v.target_pre_money,
                "valuation.pre_money",
                1,
            )
        )
        dp += 1

    arr = _parse_amount(v.arr) if v.arr else None
    if arr and v.revenue_multiple_used:
        implied_val = arr * v.revenue_multiple_used
        ev.append(
            _evidence(
                "valuation",
                f"Revenue-multiple valuation: {v.arr} × {v.revenue_multiple_used}x = implied ₹{implied_val:,.0f}",
                f"{v.revenue_multiple_used}x ARR",
                "valuation.revenue_multiple",
                1,
            )
        )
        dp += 1

    if v.comparable_startups:
        ev.append(
            _evidence(
                "valuation",
                f"Comparable companies used: {', '.join(v.comparable_startups[:4])}",
                f"{len(v.comparable_startups)} comparables",
                "valuation.comparables",
                len(v.comparable_startups),
            )
        )
        dp += 1

    score = min(100, dp * 22 + 10)
    return _cap(
        "valuation_analysis",
        score,
        _conf(dp),
        ev,
        {
            "method": v.valuation_method,
            "pre_money": v.target_pre_money,
            "arr": v.arr,
            "multiple": v.revenue_multiple_used,
        },
        lim,
        dp / 4,
    )


def build_cap_table_analysis(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """F3 — Cap Table Analyzer: equity distribution and dilution impact."""
    ev, lim, dp = [], [], 0
    c = ext.cap_table
    issues = []

    if not c:
        lim.append("No cap table data provided.")
        return _cap("cap_table_analysis", 0, "low", ev, {}, lim, 0.0)

    total = 0
    if c.founders_equity is not None:
        total += c.founders_equity
        if c.founders_equity < 50:
            issues.append(f"Founder equity {c.founders_equity}% — below 50% may concern investors")
        ev.append(
            _evidence(
                "cap_table",
                f"Founder equity: {c.founders_equity}%",
                f"{c.founders_equity}%",
                "cap_table.founders_equity",
                1,
            )
        )
        dp += 1

    if c.employee_esop_pool is not None:
        total += c.employee_esop_pool
        ev.append(
            _evidence(
                "cap_table", f"ESOP pool: {c.employee_esop_pool}%", f"{c.employee_esop_pool}%", "cap_table.esop", 1
            )
        )
        dp += 1

    if c.existing_investor_equity is not None:
        total += c.existing_investor_equity
        ev.append(
            _evidence(
                "cap_table",
                f"Existing investor equity: {c.existing_investor_equity}%",
                f"{c.existing_investor_equity}%",
                "cap_table.investors",
                1,
            )
        )
        dp += 1

    if c.new_round_dilution is not None:
        post_founder = (c.founders_equity or 0) - c.new_round_dilution * ((c.founders_equity or 50) / 100)
        ev.append(
            _evidence(
                "cap_table",
                f"This round dilution: {c.new_round_dilution}% → post-round founder ~{post_founder:.1f}%",
                f"{c.new_round_dilution}%",
                "cap_table.new_round",
                1,
            )
        )
        dp += 1

    if abs(total - 100) > 5 and total > 0:
        issues.append(f"Cap table totals {total:.1f}% — should sum to 100%")

    score = max(0, min(100, dp * 22 - len(issues) * 15 + 10))
    return _cap(
        "cap_table_analysis",
        score,
        _conf(dp),
        ev,
        {
            "founders_equity": c.founders_equity,
            "esop": c.employee_esop_pool,
            "total_accounted": round(total, 1),
            "issues": issues,
        },
        lim,
        dp / 4,
    )


def build_safe_note_analysis(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """F4 — SAFE / Convertible Note Analyzer."""
    ev, lim, dp = [], [], 0
    s = ext.safe_note
    risks = []

    if not s:
        lim.append("No SAFE/note data provided.")
        return _cap("safe_note_analysis", 0, "low", ev, {}, lim, 0.0)

    if s.instrument_type:
        ev.append(_evidence("safe_note", f"Instrument: {s.instrument_type}", s.instrument_type, "safe_note.type", 1))
        dp += 1

    if s.valuation_cap:
        ev.append(_evidence("safe_note", f"Valuation cap: {s.valuation_cap}", s.valuation_cap, "safe_note.cap", 1))
        dp += 1

    if s.discount_rate is not None:
        if s.discount_rate > 25:
            risks.append(f"High discount rate: {s.discount_rate}% (>25% is unusual)")
        ev.append(
            _evidence("safe_note", f"Discount rate: {s.discount_rate}%", f"{s.discount_rate}%", "safe_note.discount", 1)
        )
        dp += 1

    if s.has_mfn_clause is not None:
        ev.append(
            _evidence(
                "safe_note",
                f"MFN clause: {'Present ✓' if s.has_mfn_clause else 'Not present'}",
                str(s.has_mfn_clause),
                "safe_note.mfn",
                1,
            )
        )
        dp += 1

    if s.total_raised_via_safe:
        ev.append(
            _evidence(
                "safe_note",
                f"Total raised via SAFE/notes: {s.total_raised_via_safe}",
                s.total_raised_via_safe,
                "safe_note.total_raised",
                1,
            )
        )
        dp += 1

    score = max(0, min(100, dp * 18 - len(risks) * 10 + 10))
    return _cap(
        "safe_note_analysis",
        score,
        _conf(dp),
        ev,
        {"type": s.instrument_type, "cap": s.valuation_cap, "discount": s.discount_rate, "risks": risks},
        lim,
        dp / 5,
    )


def build_revenue_metrics_dashboard(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """F5 — Revenue Metrics Dashboard: MRR, ARR, churn, NRR."""
    ev, lim, dp = [], [], 0
    r = ext.revenue_metrics

    if not r:
        lim.append("No revenue metrics provided.")
        return _cap("revenue_metrics_dashboard", 0, "low", ev, {}, lim, 0.0)

    if r.mrr:
        ev.append(_evidence("revenue", f"MRR: {r.mrr}", r.mrr, "revenue_metrics.mrr", 1))
        dp += 1
    if r.arr:
        ev.append(_evidence("revenue", f"ARR: {r.arr}", r.arr, "revenue_metrics.arr", 1))
        dp += 1
    if r.churn_rate is not None:
        churn_flag = r.churn_rate > 5
        ev.append(
            _evidence(
                "revenue",
                f"Monthly churn: {r.churn_rate}% {'⚠ high' if churn_flag else '✓ healthy'}",
                f"{r.churn_rate}%",
                "revenue_metrics.churn",
                1,
            )
        )
        if churn_flag:
            lim.append(f"High monthly churn rate: {r.churn_rate}% — investors will probe retention deeply")
        dp += 1
    if r.net_revenue_retention is not None:
        ev.append(
            _evidence(
                "revenue",
                f"NRR: {r.net_revenue_retention}% {'✓ >100 (expansion)' if r.net_revenue_retention >= 100 else '⚠ contraction'}",
                f"{r.net_revenue_retention}%",
                "revenue_metrics.nrr",
                1,
            )
        )
        dp += 1
    if r.paying_customers:
        ev.append(
            _evidence(
                "revenue",
                f"Paying customers: {r.paying_customers}",
                str(r.paying_customers),
                "revenue_metrics.paying_customers",
                1,
            )
        )
        dp += 1

    score = min(100, dp * 18 + (10 if r.net_revenue_retention and r.net_revenue_retention >= 100 else 0))
    return _cap(
        "revenue_metrics_dashboard",
        score,
        _conf(dp),
        ev,
        {
            "mrr": r.mrr,
            "arr": r.arr,
            "churn": r.churn_rate,
            "nrr": r.net_revenue_retention,
            "paying_customers": r.paying_customers,
        },
        lim,
        dp / 5,
    )


def build_unit_economics_deep_dive(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """F6 — Unit Economics Deep Dive: CAC, LTV, payback by channel."""
    ev, lim, dp = [], [], 0
    u = ext.unit_economics_detail

    if not u:
        lim.append("No detailed unit economics data provided.")
        return _cap("unit_economics_deep_dive", 0, "low", ev, {}, lim, 0.0)

    if u.cac_by_channel:
        for ch, cac in u.cac_by_channel.items():
            ev.append(_evidence("unit_econ", f"CAC ({ch}): {cac}", cac, f"unit_economics.cac.{ch}", 1))
        dp += 1

    if u.ltv:
        ev.append(_evidence("unit_econ", f"LTV: {u.ltv}", u.ltv, "unit_economics.ltv", 1))
        dp += 1

    if u.payback_period_months is not None:
        flag = u.payback_period_months > 18
        ev.append(
            _evidence(
                "unit_econ",
                f"CAC payback: {u.payback_period_months} months {'⚠ long' if flag else '✓'}",
                f"{u.payback_period_months}m",
                "unit_economics.payback",
                1,
            )
        )
        if flag:
            lim.append(f"Long CAC payback period: {u.payback_period_months} months — investors prefer <18 months")
        dp += 1

    if u.gross_margin is not None:
        ev.append(
            _evidence("unit_econ", f"Gross margin: {u.gross_margin}%", f"{u.gross_margin}%", "unit_economics.gm", 1)
        )
        dp += 1

    score = min(100, dp * 22 + 10)
    return _cap(
        "unit_economics_deep_dive",
        score,
        _conf(dp),
        ev,
        {
            "ltv": u.ltv,
            "payback": u.payback_period_months,
            "gross_margin": u.gross_margin,
            "cac_channels": u.cac_by_channel,
        },
        lim,
        dp / 4,
    )


def build_fundraising_timeline(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """F7+F8 — Fundraising Timeline Planner and Investor Return Modeler."""
    ev, lim, dp = [], [], 0
    f = ext.fundraising_timeline
    v = ext.valuation

    if not f and not v:
        lim.append("No fundraising timeline or valuation data provided.")
        return _cap("fundraising_timeline", 0, "low", ev, {}, lim, 0.0)

    if f:
        if f.target_close_date:
            ev.append(
                _evidence(
                    "fundraising",
                    f"Target close date: {f.target_close_date}",
                    f.target_close_date,
                    "fundraising_timeline.close_date",
                    1,
                )
            )
            dp += 1
        if f.amount_committed_so_far:
            ev.append(
                _evidence(
                    "fundraising",
                    f"Amount committed so far: {f.amount_committed_so_far}",
                    f.amount_committed_so_far,
                    "fundraising_timeline.committed",
                    1,
                )
            )
            dp += 1
        if f.key_milestones_for_close:
            ev.append(
                _evidence(
                    "fundraising",
                    f"Key milestones for close: {', '.join(f.key_milestones_for_close[:3])}",
                    f"{len(f.key_milestones_for_close)} milestones",
                    "fundraising_timeline.milestones",
                    len(f.key_milestones_for_close),
                )
            )
            dp += 1
        if f.parallel_grant_applications:
            ev.append(
                _evidence(
                    "fundraising",
                    f"Parallel grant applications: {', '.join(f.parallel_grant_applications)}",
                    f"{len(f.parallel_grant_applications)} grants",
                    "fundraising_timeline.grants",
                    len(f.parallel_grant_applications),
                )
            )
            dp += 1

    # Return modeling from valuation
    if v and v.target_pre_money and v.arr:
        arr_val = _parse_amount(v.arr)
        pre_money = _parse_amount(v.target_pre_money)
        if arr_val and pre_money:
            multiple = pre_money / max(arr_val, 1)
            ev.append(
                _evidence(
                    "fundraising",
                    f"Entry multiple: {multiple:.1f}x ARR — context for investor return modeling",
                    f"{multiple:.1f}x",
                    "Derived: pre_money / arr",
                    1,
                )
            )
            dp += 1

    score = min(100, dp * 18 + 10)
    return _cap(
        "fundraising_timeline",
        score,
        _conf(dp),
        ev,
        {
            "close_date": f.target_close_date if f else None,
            "committed": f.amount_committed_so_far if f else None,
            "milestones": f.key_milestones_for_close if f else None,
        },
        lim,
        dp / 5,
    )


# ════════════════════════════════════════════════════════════════════
# GROUP S — Strategic Intelligence (7 capabilities)
# ════════════════════════════════════════════════════════════════════


def build_competitive_moat_analysis(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """S1 — Competitive Moat Analyzer: deep competitive matrix."""
    ev, lim, dp = [], [], 0
    c = ext.competitive_matrix

    if not c:
        lim.append("No competitive matrix data provided.")
        return _cap("competitive_moat_analysis", 0, "low", ev, {}, lim, 0.0)

    if c.competitors:
        ev.append(
            _evidence(
                "competitive",
                f"Competitive matrix: {len(c.competitors)} competitors analysed",
                f"{len(c.competitors)} competitors",
                "competitive_matrix.competitors",
                len(c.competitors),
            )
        )
        dp += 1

    if c.primary_differentiator:
        ev.append(
            _evidence(
                "competitive",
                f"Primary differentiator: {c.primary_differentiator}",
                c.primary_differentiator,
                "competitive_matrix.differentiator",
                1,
            )
        )
        dp += 1

    if c.defensible_moats:
        ev.append(
            _evidence(
                "competitive",
                f"Defensible moats: {', '.join(c.defensible_moats)}",
                f"{len(c.defensible_moats)} moats",
                "competitive_matrix.moats",
                len(c.defensible_moats),
            )
        )
        dp += 1

    if c.network_effects is not None:
        ev.append(
            _evidence(
                "competitive",
                f"Network effects: {'Present ✓ — strong defensibility' if c.network_effects else 'Not present'}",
                str(c.network_effects),
                "competitive_matrix.network_effects",
                1,
            )
        )
        dp += 1

    if c.switching_cost_high is not None:
        ev.append(
            _evidence(
                "competitive",
                f"Switching cost: {'High ✓' if c.switching_cost_high else 'Low — retention risk'}",
                str(c.switching_cost_high),
                "competitive_matrix.switching_cost",
                1,
            )
        )
        dp += 1

    score = min(100, dp * 17 + (len(c.defensible_moats or []) * 5))
    return _cap(
        "competitive_moat_analysis",
        score,
        _conf(dp),
        ev,
        {
            "competitors_count": len(c.competitors or []),
            "moats": c.defensible_moats,
            "differentiator": c.primary_differentiator,
            "network_effects": c.network_effects,
        },
        lim,
        dp / 5,
    )


def build_regulatory_compliance_check(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """S2 — Regulatory & Compliance Tracker."""
    ev, lim, dp = [], [], 0
    r = ext.regulatory
    risks = []

    if not r:
        lim.append("No regulatory data provided.")
        return _cap("regulatory_compliance_check", 0, "low", ev, {}, lim, 0.0)

    if r.licenses_required and r.licenses_obtained:
        pending = [lic for lic in r.licenses_required if lic not in r.licenses_obtained]
        ev.append(
            _evidence(
                "regulatory",
                f"Licenses: {len(r.licenses_obtained)}/{len(r.licenses_required)} obtained",
                f"{len(r.licenses_obtained)}/{len(r.licenses_required)}",
                "regulatory.licenses",
                1,
            )
        )
        for p in pending:
            risks.append(f"License pending: {p}")
        dp += 1

    if r.gdpr_compliant is not None:
        ev.append(
            _evidence(
                "regulatory",
                f"GDPR/Data compliance: {'✓' if r.gdpr_compliant else '⚠ Not compliant'}",
                str(r.gdpr_compliant),
                "regulatory.gdpr",
                1,
            )
        )
        if not r.gdpr_compliant:
            risks.append("Not GDPR/data compliance compliant — required for enterprise sales")
        dp += 1

    if r.data_residency_compliant is not None:
        ev.append(
            _evidence(
                "regulatory",
                f"Data residency (India): {'✓' if r.data_residency_compliant else '⚠ Not compliant'}",
                str(r.data_residency_compliant),
                "regulatory.data_residency",
                1,
            )
        )
        dp += 1

    if r.pending_compliance_items:
        for item in r.pending_compliance_items:
            lim.append(f"Compliance gap: {item}")
        dp += 1

    score = max(0, min(100, dp * 22 - len(risks) * 10 + 10))
    return _cap(
        "regulatory_compliance_check",
        score,
        _conf(dp),
        ev,
        {
            "risks": risks,
            "licenses_pending": [lic for lic in (r.licenses_required or []) if lic not in (r.licenses_obtained or [])],
        },
        lim,
        dp / 4,
    )


def build_ip_tracker(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """S3 — IP & Patent Tracker."""
    ev, lim, dp = [], [], 0
    ip = ext.ip_tracker

    if not ip:
        lim.append("No IP/patent data provided.")
        return _cap("ip_tracker", 0, "low", ev, {}, lim, 0.0)

    total_ip = 0
    if ip.patents_filed:
        total_ip += ip.patents_filed
        ev.append(_evidence("ip", f"Patents filed: {ip.patents_filed}", str(ip.patents_filed), "ip_tracker.filed", 1))
        dp += 1
    if ip.patents_granted:
        total_ip += ip.patents_granted
        ev.append(
            _evidence("ip", f"Patents granted: {ip.patents_granted}", str(ip.patents_granted), "ip_tracker.granted", 1)
        )
        dp += 1
    if ip.patents_pending:
        ev.append(
            _evidence("ip", f"Patents pending: {ip.patents_pending}", str(ip.patents_pending), "ip_tracker.pending", 1)
        )
        dp += 1
    if ip.trademarks_registered:
        ev.append(
            _evidence(
                "ip",
                f"Trademarks registered: {ip.trademarks_registered}",
                str(ip.trademarks_registered),
                "ip_tracker.trademarks",
                1,
            )
        )
        dp += 1
    if ip.trade_secrets_documented is not None:
        ev.append(
            _evidence(
                "ip",
                f"Trade secrets documented: {'✓' if ip.trade_secrets_documented else 'No'}",
                str(ip.trade_secrets_documented),
                "ip_tracker.secrets",
                1,
            )
        )
        dp += 1

    score = min(100, total_ip * 15 + dp * 10)
    return _cap(
        "ip_tracker",
        score,
        _conf(dp),
        ev,
        {
            "patents_total": total_ip,
            "trademarks": ip.trademarks_registered,
            "trade_secrets_documented": ip.trade_secrets_documented,
        },
        lim,
        dp / 5,
    )


def build_partnership_tracker(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """S4 — Partnership & BD Tracker."""
    ev, lim, dp = [], [], 0
    p = ext.partnerships

    if not p:
        lim.append("No partnership data provided.")
        return _cap("partnership_tracker", 0, "low", ev, {}, lim, 0.0)

    if p.strategic_partners:
        active = [pa for pa in p.strategic_partners if pa.get("status", "").lower() == "active"]
        ev.append(
            _evidence(
                "partnerships",
                f"Strategic partners: {len(p.strategic_partners)} ({len(active)} active)",
                f"{len(p.strategic_partners)} partners",
                "partnerships.strategic",
                len(p.strategic_partners),
            )
        )
        dp += 1

    if p.channel_partners:
        ev.append(
            _evidence(
                "partnerships",
                f"Channel/reseller partners: {p.channel_partners}",
                str(p.channel_partners),
                "partnerships.channel",
                1,
            )
        )
        dp += 1

    if p.mou_signed:
        ev.append(_evidence("partnerships", f"MOUs signed: {p.mou_signed}", str(p.mou_signed), "partnerships.mou", 1))
        dp += 1

    score = min(100, dp * 25 + (p.mou_signed or 0) * 5 + len(p.strategic_partners or []) * 5)
    return _cap(
        "partnership_tracker",
        score,
        _conf(dp),
        ev,
        {
            "strategic_partners": len(p.strategic_partners or []),
            "channel_partners": p.channel_partners,
            "mous": p.mou_signed,
        },
        lim,
        dp / 3,
    )


def build_accelerator_grant_matcher(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """S5 — Accelerator & Grant Matcher."""
    ev, lim, dp = [], [], 0
    a = ext.accelerator_grant

    if not a:
        lim.append("No accelerator/grant data provided.")
        return _cap("accelerator_grant_matcher", 0, "low", ev, {}, lim, 0.0)

    if a.accepted_by:
        ev.append(
            _evidence(
                "accelerator",
                f"Accelerated by: {', '.join(a.accepted_by)}",
                f"{len(a.accepted_by)} programs",
                "accelerator_grant.accepted",
                len(a.accepted_by),
            )
        )
        dp += 1

    if a.applied_to:
        ev.append(
            _evidence(
                "accelerator",
                f"Applied to: {', '.join(a.applied_to[:5])}",
                f"{len(a.applied_to)} programs",
                "accelerator_grant.applied",
                len(a.applied_to),
            )
        )
        dp += 1

    if a.grant_funding_received:
        ev.append(
            _evidence(
                "accelerator",
                f"Grant funding received: {a.grant_funding_received}",
                a.grant_funding_received,
                "accelerator_grant.grant_funding",
                1,
            )
        )
        dp += 1

    if a.dpiit_recognized is not None:
        ev.append(
            _evidence(
                "accelerator",
                f"DPIIT recognition: {'✓ Recognized' if a.dpiit_recognized else 'Not applied'}",
                str(a.dpiit_recognized),
                "accelerator_grant.dpiit",
                1,
            )
        )
        dp += 1

    if a.iim_iit_incubated is not None:
        ev.append(
            _evidence(
                "accelerator",
                f"IIM/IIT incubation: {'✓ Yes' if a.iim_iit_incubated else 'No'}",
                str(a.iim_iit_incubated),
                "accelerator_grant.incubated",
                1,
            )
        )
        dp += 1

    score = min(100, len(a.accepted_by or []) * 20 + dp * 12 + (10 if a.dpiit_recognized else 0))
    return _cap(
        "accelerator_grant_matcher",
        score,
        _conf(dp),
        ev,
        {
            "accepted": a.accepted_by,
            "grant_funding": a.grant_funding_received,
            "dpiit": a.dpiit_recognized,
            "iim_iit": a.iim_iit_incubated,
        },
        lim,
        dp / 5,
    )


def build_board_advisor_analysis(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """S6 — Board & Advisor Tracker."""
    ev, lim, dp = [], [], 0
    b = ext.board_advisors

    if not b:
        lim.append("No board/advisor data provided.")
        return _cap("board_advisor_analysis", 0, "low", ev, {}, lim, 0.0)

    if b.board_members:
        ev.append(
            _evidence(
                "board",
                f"Board members: {len(b.board_members)} ({', '.join(m.get('name', '?') for m in b.board_members[:3])})",
                f"{len(b.board_members)} members",
                "board_advisors.board_members",
                len(b.board_members),
            )
        )
        dp += 1

    if b.advisors:
        ev.append(
            _evidence(
                "board",
                f"Advisors: {len(b.advisors)} ({', '.join(a.get('name', '?') for a in b.advisors[:3])})",
                f"{len(b.advisors)} advisors",
                "board_advisors.advisors",
                len(b.advisors),
            )
        )
        dp += 1

    if b.independent_directors:
        ev.append(
            _evidence(
                "board",
                f"Independent directors: {b.independent_directors}",
                str(b.independent_directors),
                "board_advisors.independent",
                1,
            )
        )
        dp += 1

    if b.advisor_network_reach:
        ev.append(
            _evidence(
                "board",
                f"Advisor network: {b.advisor_network_reach}",
                b.advisor_network_reach,
                "board_advisors.network",
                1,
            )
        )
        dp += 1

    score = min(100, len(b.board_members or []) * 15 + len(b.advisors or []) * 10 + dp * 10)
    return _cap(
        "board_advisor_analysis",
        score,
        _conf(dp),
        ev,
        {
            "board_size": len(b.board_members or []),
            "advisors_count": len(b.advisors or []),
            "independent_directors": b.independent_directors,
        },
        lim,
        dp / 4,
    )


def build_exit_strategy_analysis(ext: ExternalDataRequest, file_texts: Dict[str, str]) -> CapabilityResult:
    """S7 — Exit Strategy Analyzer."""
    ev, lim, dp = [], [], 0
    e = ext.exit_strategy

    if not e:
        lim.append("No exit strategy data provided.")
        return _cap("exit_strategy_analysis", 0, "low", ev, {}, lim, 0.0)

    if e.preferred_exit:
        ev.append(
            _evidence("exit", f"Preferred exit: {e.preferred_exit}", e.preferred_exit, "exit_strategy.preferred", 1)
        )
        dp += 1

    if e.target_exit_timeline:
        ev.append(
            _evidence(
                "exit", f"Exit timeline: {e.target_exit_timeline}", e.target_exit_timeline, "exit_strategy.timeline", 1
            )
        )
        dp += 1

    if e.potential_acquirers:
        ev.append(
            _evidence(
                "exit",
                f"Potential acquirers: {', '.join(e.potential_acquirers[:5])}",
                f"{len(e.potential_acquirers)} companies",
                "exit_strategy.acquirers",
                len(e.potential_acquirers),
            )
        )
        dp += 1

    if e.comparable_exits:
        ev.append(
            _evidence(
                "exit",
                f"Comparable exits: {len(e.comparable_exits)} reference transactions",
                f"{len(e.comparable_exits)} exits",
                "exit_strategy.comparables",
                len(e.comparable_exits),
            )
        )
        dp += 1

    if e.target_exit_valuation:
        ev.append(
            _evidence(
                "exit",
                f"Target exit valuation: {e.target_exit_valuation}",
                e.target_exit_valuation,
                "exit_strategy.target_valuation",
                1,
            )
        )
        dp += 1

    score = min(100, dp * 18 + 10)
    return _cap(
        "exit_strategy_analysis",
        score,
        _conf(dp),
        ev,
        {
            "exit_type": e.preferred_exit,
            "timeline": e.target_exit_timeline,
            "acquirers": e.potential_acquirers,
            "target_valuation": e.target_exit_valuation,
        },
        lim,
        dp / 5,
    )


# ════════════════════════════════════════════════════════════════════
# MASTER EXTERNAL INTELLIGENCE AGGREGATOR
# ════════════════════════════════════════════════════════════════════


def extract_external_intelligence(
    ext: ExternalDataRequest,
    file_texts: Dict[str, str],
) -> Dict[str, Any]:
    """
    Run all 32 external-data capability engines.

    Args:
        ext:         ExternalDataRequest — all optional external data fields
        file_texts:  Dict mapping file_id → extracted_text from UploadedFile records

    Returns a dict compatible with the survey_intelligence output structure,
    containing all 32 capabilities.
    """

    # Group D — Document Intelligence (9)
    capabilities_d = [
        build_pitch_deck_analysis(ext, file_texts),
        build_term_sheet_analysis(ext, file_texts),
        build_financial_model_review(ext, file_texts),
        build_due_diligence_readiness(ext, file_texts),
        build_data_room_audit(ext, file_texts),
        build_one_pager_review(ext, file_texts),
        build_reference_letter_quality(ext, file_texts),
        build_legal_status_check(ext, file_texts),
        build_media_kit_review(ext, file_texts),
    ]

    # Group C — CRM / Investor Pipeline (8)
    capabilities_c = [
        build_investor_pipeline_tracker(ext, file_texts),
        build_investor_meeting_prep(ext, file_texts),
        build_investor_type_matching(ext, file_texts),
        build_vc_firm_targeting(ext, file_texts),
        build_pitch_feedback_analysis(ext, file_texts),
        build_portfolio_fit_analysis(ext, file_texts),
        build_objection_response_library(ext, file_texts),
    ]

    # Group F — Financial Intelligence (8)
    capabilities_f = [
        build_burn_runway_analysis(ext, file_texts),
        build_valuation_analysis(ext, file_texts),
        build_cap_table_analysis(ext, file_texts),
        build_safe_note_analysis(ext, file_texts),
        build_revenue_metrics_dashboard(ext, file_texts),
        build_unit_economics_deep_dive(ext, file_texts),
        build_fundraising_timeline(ext, file_texts),
    ]

    # Group S — Strategic Intelligence (7)
    capabilities_s = [
        build_competitive_moat_analysis(ext, file_texts),
        build_regulatory_compliance_check(ext, file_texts),
        build_ip_tracker(ext, file_texts),
        build_partnership_tracker(ext, file_texts),
        build_accelerator_grant_matcher(ext, file_texts),
        build_board_advisor_analysis(ext, file_texts),
        build_exit_strategy_analysis(ext, file_texts),
    ]

    all_caps = capabilities_d + capabilities_c + capabilities_f + capabilities_s

    # Only score capabilities that have actual data (score > 0)
    scored_caps = [c for c in all_caps if c.score > 0]
    avg_score = int(sum(c.score for c in scored_caps) / max(len(scored_caps), 1)) if scored_caps else 0
    total_evidence = sum(c.evidence_count for c in all_caps)

    # Build prompt section for AI
    prompt_lines = ["== EXTERNAL DATA INTELLIGENCE (FOUNDER-PROVIDED) ==\n"]
    for cap in all_caps:
        if cap.score > 0:
            prompt_lines.append(f"\n--- {cap.capability_name.replace('_', ' ').upper()} ---")
            prompt_lines.append(f"Score: {cap.score}/100 | Confidence: {cap.confidence}")
            for ev in cap.evidence_statements[:4]:
                prompt_lines.append(f"  • {ev.statement}")
            if cap.limitations:
                for lim in cap.limitations[:2]:
                    prompt_lines.append(f"  ⚠ {lim}")

    def _to_dict(c: CapabilityResult) -> Dict[str, Any]:
        return {
            "capability_name": c.capability_name,
            "score": c.score,
            "confidence": c.confidence,
            "evidence_count": c.evidence_count,
            "data_coverage": c.data_coverage,
            "evidence_statements": [
                {
                    "category": e.category,
                    "statement": e.statement,
                    "data_point": e.data_point,
                    "source_question": e.source_question,
                    "sample_size": e.sample_size,
                }
                for e in c.evidence_statements
            ],
            "raw_metrics": c.raw_metrics,
            "limitations": c.limitations,
        }

    return {
        "capabilities": {c.capability_name: _to_dict(c) for c in all_caps},
        "capabilities_with_data": len(scored_caps),
        "total_capabilities": len(all_caps),
        "avg_score": avg_score,
        "total_evidence": total_evidence,
        "prompt_section": "\n".join(prompt_lines),
        "groups": {
            "document_intelligence": [c.capability_name for c in capabilities_d],
            "crm_pipeline": [c.capability_name for c in capabilities_c],
            "financial_intelligence": [c.capability_name for c in capabilities_f],
            "strategic_intelligence": [c.capability_name for c in capabilities_s],
        },
    }
