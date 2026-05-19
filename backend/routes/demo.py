
import os
import uuid
import requests

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import DemoSchedule
from schemas.demo import DemoRequest

from services.email_service import send_email

from core.rate_limiter import limiter

router = APIRouter(
    prefix="/demo",
    tags=["demo"]
)

# Zoom credentials
ACCOUNT_ID = os.getenv("ZOOM_ACCOUNT_ID")
CLIENT_ID = os.getenv("ZOOM_CLIENT_ID")
CLIENT_SECRET = os.getenv("ZOOM_CLIENT_SECRET")


@router.post("/schedule")
@limiter.limit("5/minute")
def schedule_demo(
    request: Request,
    body: DemoRequest,
    db: Session = Depends(get_db)
):

    # ---------------------------------------------------
    # STEP 1 → Get Zoom Access Token
    # ---------------------------------------------------

    token_url = (
        f"https://zoom.us/oauth/token"
        f"?grant_type=account_credentials"
        f"&account_id={ACCOUNT_ID}"
    )

    token_response = requests.post(
        token_url,
        auth=(CLIENT_ID, CLIENT_SECRET)
    )

    token_data = token_response.json()

    access_token = token_data["access_token"]

    # ---------------------------------------------------
    # STEP 2 → Create Zoom Meeting
    # ---------------------------------------------------

    meeting_url = "https://api.zoom.us/v2/users/me/meetings"

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    start_time = (
        datetime.utcnow() + timedelta(minutes=10)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")

    meeting_data = {
        "topic": "AxioraPulse Demo Call",

        "type": 2,

        "start_time": start_time,

        "duration": 60,

        "timezone": "Asia/Kolkata",

        "agenda": "AxioraPulse Product Demo",

        "settings": {
            "join_before_host": True,
            "waiting_room": True
        }
    }

    meeting_response = requests.post(
        meeting_url,
        json=meeting_data,
        headers=headers
    )

    meeting = meeting_response.json()

    join_url = meeting.get("join_url")

    meeting_id = str(
        meeting.get("id")
    )

    # ---------------------------------------------------
    # STEP 3 → Save Demo Booking
    # ---------------------------------------------------

   
    demo = DemoSchedule(
        id=str(uuid.uuid4()),

        name=body.name,

        email=body.email,

        demo_date=body.demo_date,

        time_slot=body.time_slot,

        meeting_link=join_url,

        status="scheduled"
    )


    db.add(demo)
    db.commit()

    # ---------------------------------------------------
    # STEP 4 → Send Email
    # ---------------------------------------------------

    send_email(
        to_email=body.email,

        subject="Your AxioraPulse Demo Call",

body=f"""
Hi {body.name},

Your demo meeting has been scheduled successfully.

Zoom Meeting Link:
{join_url}

Meeting ID:
{meeting_id}

Demo Date:
{body.demo_date}

Time Slot:
{body.time_slot}

Thanks,
AxioraPulse Team
"""



    )

    # ---------------------------------------------------
    # STEP 5 → Return Response
    # ---------------------------------------------------

    return {
        "message": "Demo scheduled successfully",

        "zoom_join_url": join_url,

        "meeting_id": meeting_id
    }

