"""
routes/public.py
─────────────────
Unauthenticated endpoints called by public-facing survey pages.

POST /public/send-email  — Send survey share or resume-link email via AWS SES
"""

import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Literal, Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from services.email_service import send_email
from db.database import get_db
from db.models import WaitlistEntry

router = APIRouter(prefix="/public", tags=["public"])
logger = logging.getLogger(__name__)


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
    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Welcome to Axiora Pulse</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Fraunces:wght@300;400;500&family=Syne:wght@400;600;700&display=swap" rel="stylesheet">
</head>

<body style="margin:0;padding:0;background:#f5efe6;font-family:Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5efe6;padding:40px 16px;">
<tr>
<td align="center">

<table width="100%" cellpadding="0" cellspacing="0" border="0"
style="
max-width:640px;
background:#fffaf4;
border-radius:28px;
overflow:hidden;
border:1px solid rgba(22,15,8,0.06);
box-shadow:0 10px 40px rgba(22,15,8,0.08);
">

    <!-- HEADER -->
    <tr>
        <td style="
            background:#f7f1e8;
            padding:28px 42px;
            border-bottom:1px solid rgba(22,15,8,0.06);
        ">

            <table width="100%" cellpadding="0" cellspacing="0">
                <tr>

                    <td align="left">
                        <table cellpadding="0" cellspacing="0">
                            <tr>

                                <td style="
                                    font-size:12px;
                                    font-weight:700;
                                    letter-spacing:4px;
                                    text-transform:uppercase;
                                    color:#8f867b;
                                    padding-right:8px;
                                    vertical-align:middle;
                                ">
                                    AXIORA
                                </td>

                                <td style="
                                    font-family:'Playfair Display',serif;
                                    font-size:42px;
                                    font-weight:700;
                                    color:#160F08;
                                    letter-spacing:-2px;
                                    vertical-align:middle;
                                ">
                                    Pulse
                                </td>

                                <td style="padding-left:10px;padding-top:2px;vertical-align:top;">
                                    <div style="
                                        width:18px;
                                        height:18px;
                                        border-radius:50%;
                                        background:#ff5b1f;
                                        box-shadow:
                                            0 0 0 6px rgba(255,91,31,0.18),
                                            0 0 0 12px rgba(255,91,31,0.08);
                                    "></div>
                                </td>

                            </tr>
                        </table>
                </tr>
            </table>

        </td>
    </tr>
<!-- PREMIUM BRAND POSITIONING -->
<table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
    <tr>

        <td style="padding-right:14px;" valign="middle">
            <div style="
                width:34px;
                height:1px;
                background:linear-gradient(90deg,#ff5b1f,#ffb800);
            "></div>
        </td>

        <td valign="middle">

            <span style="
                font-family:'Syne',Arial,sans-serif;
                font-size:10px;
                font-weight:700;
                letter-spacing:2.2px;
                text-transform:uppercase;
                color:#a89583;
                line-height:1.9;
            ">
                INDIA’S LARGEST MARKET<br/>
                FEEDBACK &amp; DECISION-MAKING PLATFORM
            </span>

        </td>

    </tr>
</table>
    <!-- HERO -->
    <tr>
        <td style="
            padding:60px 38px 14px;
            background:
                radial-gradient(circle at top right, rgba(255,91,31,0.08), transparent 35%),
                #fffaf4;
        ">

            <p style="
                margin:0 0 18px;
                font-size:12px;
                font-weight:700;
                letter-spacing:3px;
                text-transform:uppercase;
                color:#ff5b1f;
            ">
                WAITLIST CONFIRMED
            </p>

            <h1 style="
                margin:0;
                font-family:'Playfair Display',serif;
                font-size:42px;
                line-height:1.15;
                letter-spacing:-2px;
                color:#160F08;
                font-weight:700;
            ">
                You're officially<br/>
                on the list.
            </h1>

            <p style="
                font-family:'Fraunces',serif;
font-size:17px;
font-weight:300;
line-height:1.9;
color:#6f665d;
            ">
                Thank you for joining the Axiora Pulse early access waitlist.
                We're building a premium AI-powered research ecosystem focused on
                smarter surveys, better decision intelligence, and enterprise-grade analytics.
            </p>

        </td>
    </tr>

    <!-- USER INFO CARD -->
    <tr>
        <td style="padding:0 48px 18px;">

            <table width="100%" cellpadding="0" cellspacing="0" border="0"
            style="
                background:#f8f2eb;
                border-radius:22px;
                border:1px solid rgba(22,15,8,0.05);
            ">
                <tr>

                    <td style="padding:28px;">

                        <p style="
                            margin:0 0 10px;
                            font-family:'Syne',sans-serif;
                            font-size:11px;
                            letter-spacing:2px;
                            text-transform:uppercase;
                            color:#a0968b;
                            font-weight:700;
                        ">
                            Registered Email
                        </p>

                        <p style="
                            margin:0;
                            font-size:18px;
                            color:#160F08;
                            font-weight:700;
                            word-break:break-word;
                        ">
                            {email}
                        </p>

                    </td>

                </tr>
            </table>

        </td>
    </tr>

    <!-- CONTENT -->
    <tr>
        <td style="padding:10px 48px 10px;">

            <table width="100%" cellpadding="0" cellspacing="0">
                <tr>

                    <td style="
                        padding:20px 0;
                        border-bottom:1px solid rgba(22,15,8,0.06);
                    ">

                        <h3 style="
                            margin:0 0 12px;
                            font-size:18px;
                            font-family:'Playfair Display',serif;
                            color:#160F08;
                        ">
                            What happens next?
                        </h3>

                        <p style="
                            margin:0;
                            font-size:15px;
                            line-height:1.9;
                            color:#6f665d;
                        ">
                            You'll receive early updates, product announcements,
                            and priority access once Axiora Pulse launches publicly.
                        </p>

                    </td>

                </tr>

                <tr>

                    <td style="padding:26px 0 8px;">

                        <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>

                                <td width="33%" valign="top" style="padding-right:18px;">

                                    <p style="
                                        margin:0 0 8px;
                                        font-family:'Syne',sans-serif;
                                        font-size:13px;
                                        font-weight:700;
                                        color:#160F08;
                                    ">
                                        Research
                                    </p>

                                    <p style="
                                        margin:0;
                                        font-size:13px;
                                        line-height:1.7;
                                        color:#7a7269;
                                    ">
                                        AI-powered survey intelligence
                                    </p>

                                </td>

                                <td width="33%" valign="top" style="padding-right:18px;">

                                    <p style="
                                        margin:0 0 8px;
                                        font-size:13px;
                                        font-weight:700;
                                        font-family:'Syne',sans-serif;
                                        color:#160F08;
                                    ">
                                        Builder
                                    </p>

                                    <p style="
                                        margin:0;
                                        font-size:13px;
                                        line-height:1.7;
                                        color:#7a7269;
                                    ">
                                        Dynamic form and workflow creation
                                    </p>

                                </td>

                                <td width="33%" valign="top" style="padding-right:18px;">

                                    <p style="
                                        margin:0 0 8px;
                                        font-size:13px;
                                        font-weight:700;
                                        color:#160F08;
                                        font-family:'Syne',sans-serif;
                                    ">
                                        Analytics
                                    </p>

                                    <p style="
                                        margin:0;
                                        font-size:13px;
                                        line-height:1.7;
                                        color:#7a7269;
                                    ">
                                        Enterprise-grade insights dashboard
                                    </p>

                                </td>

                            </tr>
                        </table>

                    </td>

                </tr>
            </table>

        </td>
    </tr>

    <!-- CTA -->
    <tr>
        <td align="center" style="padding:34px 48px 56px;">

    <a href="https://axiorapulse.com"
    style="
        display:inline-block;
        background:#ff5b1f;
        color:#ffffff;
        text-decoration:none;
        padding:16px 36px;
        border-radius:999px;
        font-size:15px;
        font-weight:700;
        letter-spacing:0.3px;
        text-align:center;
        box-shadow:0 8px 20px rgba(255,91,31,0.22);
    ">
        Visit Axiora Pulse →
    </a>

</td>
    </tr>

    <!-- FOOTER -->
    <tr>
        <td style="
            background:#160F08;
            padding:32px 42px;
        ">

            <table width="100%" cellpadding="0" cellspacing="0">
                <tr>

                    <td align="left">

                        <p style="
                            margin:0 0 8px;
                            font-size:13px;
                            font-family:'Syne',sans-serif;
                            color:rgba(253,245,232,0.92);
                            font-weight:700;
                        ">
                            Axiora Pulse
                        </p>

                        <p style="
                            margin:0;
                            font-size:13px;
                            line-height:1.8;
                            color:rgba(253,245,232,0.45);
                        ">
                            Intelligent research infrastructure for modern businesses.
                        </p>

                    </td>

                    <td align="right" style="padding-left:24px;">

                        <p style="
                            margin:0;
                            font-size:12px;
                            color:rgba(253,245,232,0.35);
                            line-height:1.8;
                        ">
                            You received this email because you joined the waitlist.<br/>
                            © 2026 Axiora Pulse. All rights reserved.
                        </p>

                    </td>

                </tr>
            </table>

        </td>
    </tr>

</table>

</td>
</tr>
</table>

</body>
</html>
"""

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
    except Exception as e:
        logger.error(f"Failed to send waitlist confirmation email to {body.email}: {e}")
        pass  # Don't fail the request if email sending fails

    return {"success": True}
