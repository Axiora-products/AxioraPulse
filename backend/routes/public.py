"""
routes/public.py
─────────────────
Unauthenticated endpoints called by public-facing survey pages.

POST /public/send-email  — Send survey share or resume-link email via AWS SES
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Literal, Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from services.email_service import send_email
from db.database import get_db
from db.models import WaitlistEntry

router = APIRouter(prefix="/public", tags=["public"])


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

    try:
        send_email(to_email=body.to, subject=subject, body=html)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"success": True}


# ── Waitlist ──────────────────────────────────────────────────────────────────

class WaitlistRequest(BaseModel):
    email: EmailStr


def _waitlist_confirmation_html(email: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#160F08;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#160F08;padding:40px 20px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#1E120A;border-radius:20px;overflow:hidden;border:1px solid rgba(255,69,0,0.15);">
      <tr>
        <td style="background:#160F08;padding:22px 36px;border-bottom:1px solid rgba(255,69,0,0.1);">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="font-family:Arial,sans-serif;font-size:8px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(253,245,232,0.35);padding-right:6px;vertical-align:middle;">Axiora</td>
            <td style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#FDF5E8;letter-spacing:-0.5px;vertical-align:middle;">Pulse</td>
            <td style="width:8px;height:8px;background:#FF4500;border-radius:50%;vertical-align:top;padding-top:4px;padding-left:6px;"></td>
          </tr></table>
        </td>
      </tr>
      <tr>
        <td style="padding:40px 36px 32px;">
          <p style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#FF4500;margin:0 0 14px;">You're on the list</p>
          <h1 style="font-family:Georgia,serif;font-size:28px;font-weight:700;letter-spacing:-1px;color:#FDF5E8;margin:0 0 20px;line-height:1.15;">We'll let you know<br/>the moment we launch.</h1>
          <p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.75;color:rgba(253,245,232,0.55);margin:0 0 32px;">
            Thanks for signing up — <strong style="color:rgba(253,245,232,0.8);">{email}</strong> is on the waitlist.
            We're putting the finishing touches on Axiora Pulse and will send you a launch email the moment the doors open.
          </p>
          <p style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:rgba(253,245,232,0.35);margin:0;">
            Stay tuned for smart surveys, real insights.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 36px 28px;border-top:1px solid rgba(253,245,232,0.06);">
          <p style="font-family:Arial,sans-serif;font-size:11px;color:rgba(253,245,232,0.2);margin:0;line-height:1.6;">
            You received this because you joined the Axiora Pulse waitlist.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>"""


@router.post("/waitlist")
def join_waitlist(body: WaitlistRequest, db: Session = Depends(get_db)):
    entry = WaitlistEntry(email=body.email)
    try:
        db.add(entry)
        db.commit()
    except IntegrityError:
        db.rollback()
        # Already registered — still return success so we don't leak info

    try:
        send_email(
            to_email=body.email,
            subject="You're on the Axiora Pulse waitlist",
            body=_waitlist_confirmation_html(body.email),
        )
    except Exception:
        pass  # Don't fail the request if email sending fails

    return {"success": True}
