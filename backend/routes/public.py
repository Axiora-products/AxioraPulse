"""
routes/public.py
─────────────────
Unauthenticated endpoints called by public-facing survey pages.

POST /public/send-email  — Send survey share or resume-link email via Resend
"""

import os
import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Literal, Optional

router = APIRouter(prefix="/public", tags=["public"])

RESEND_API_URL = "https://api.resend.com/emails"


class SendEmailRequest(BaseModel):
    to: EmailStr
    surveyTitle: str
    surveyUrl: str
    type: Literal["share", "resume"] = "share"
    respondentName: Optional[str] = None


def _build_email_html(to: str, surveyTitle: str, surveyUrl: str,
                      is_resume: bool, respondentName: Optional[str]) -> str:
    greeting  = f"Hi {respondentName}," if respondentName else "Hi there,"
    headline  = "Continue where you left off" if is_resume else "You have been invited"
    body_text = (
        f"You started <strong>{surveyTitle}</strong> but didn't quite finish. "
        "Your progress is saved — pick up exactly where you left off."
        if is_resume else
        f"You've been invited to complete <strong>{surveyTitle}</strong>. "
        "It only takes a few minutes and every answer makes a difference."
    )
    cta_text    = "Resume Survey →" if is_resume else "Take the Survey →"
    footer_note = (
        "You received this because you started this survey. Your answers are saved."
        if is_resume else
        "You received this because someone shared this survey with you."
    )
    label = "Resume" if is_resume else "Invitation"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{headline}</title>
</head>
<body style="margin:0;padding:0;background:#F7F2EB;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F2EB;padding:40px 20px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFDF8;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(22,15,8,0.08);">
      <tr>
        <td style="background:#160F08;padding:22px 36px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="font-family:Arial,sans-serif;font-size:8px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(253,245,232,0.4);padding-right:6px;vertical-align:middle;">Axiora</td>
            <td style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#FDF5E8;letter-spacing:-0.5px;vertical-align:middle;">Pulse</td>
            <td style="width:8px;height:8px;background:#FF4500;border-radius:50%;vertical-align:top;padding-top:4px;padding-left:6px;"></td>
          </tr></table>
        </td>
      </tr>
      <tr>
        <td style="padding:40px 36px 32px;">
          <p style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#FF4500;margin:0 0 14px;">{label}</p>
          <h1 style="font-family:Georgia,serif;font-size:28px;font-weight:700;letter-spacing:-1px;color:#160F08;margin:0 0 20px;line-height:1.15;">{headline}</h1>
          <p style="font-family:Arial,sans-serif;font-size:13px;font-weight:400;color:rgba(22,15,8,0.55);margin:0 0 6px;">{greeting}</p>
          <p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:rgba(22,15,8,0.7);margin:0 0 32px;">{body_text}</p>
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background:#160F08;border-radius:999px;">
              <a href="{surveyUrl}" style="display:inline-block;padding:14px 36px;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#FDF5E8;text-decoration:none;">{cta_text}</a>
            </td>
          </tr></table>
          <p style="font-family:Arial,sans-serif;font-size:11px;color:rgba(22,15,8,0.3);margin:20px 0 0;line-height:1.6;">
            Or copy this link:<br/>
            <a href="{surveyUrl}" style="color:#FF4500;word-break:break-all;">{surveyUrl}</a>
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 36px 28px;border-top:1px solid rgba(22,15,8,0.07);">
          <p style="font-family:Arial,sans-serif;font-size:11px;color:rgba(22,15,8,0.3);margin:0;line-height:1.6;">{footer_note}</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>"""


@router.post("/send-email")
def send_survey_email(body: SendEmailRequest):
    """
    Send a survey share or resume-link email via Resend.
    Called from the survey builder (share) and SurveyRespond (resume link).
    No auth required — the survey URL itself is the access token.
    """
    resend_key = os.getenv("RESEND_API_KEY")
    email_from = os.getenv("EMAIL_FROM", "Axiora Pulse <noreply@axiorapulse.com>")

    if not resend_key:
        raise HTTPException(status_code=500, detail="Email service not configured")

    is_resume = body.type == "resume"
    subject = (
        f"Continue your survey: {body.surveyTitle}"
        if is_resume else
        f"You've been invited to complete: {body.surveyTitle}"
    )
    html = _build_email_html(
        to=body.to,
        surveyTitle=body.surveyTitle,
        surveyUrl=body.surveyUrl,
        is_resume=is_resume,
        respondentName=body.respondentName,
    )

    resp = requests.post(
        RESEND_API_URL,
        headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
        json={"from": email_from, "to": [body.to], "subject": subject, "html": html},
        timeout=10,
    )

    if not resp.ok:
        raise HTTPException(status_code=resp.status_code, detail=resp.json().get("message", "Email send failed"))

    return {"success": True, "id": resp.json().get("id")}
