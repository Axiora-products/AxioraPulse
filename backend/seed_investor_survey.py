"""
seed_investor_survey.py
───────────────────────
Seeds a meaningful survey with 15 questions covering all investor signal
categories, then submits 57 realistic responses with diverse answer data.

Run inside Docker:
  docker exec pulse-backend python seed_investor_survey.py
"""

import random
import uuid
from datetime import datetime, timedelta

# ── Bootstrap the app context ────────────────────────────────────────────────
from db.database import SessionLocal
from db.models import (
    Survey,
    SurveyQuestion,
    SurveyResponse,
    SurveyAnswer,
    UserProfile,
    Tenant,
)

db = SessionLocal()

# ── 1. Ensure a tenant and user exist ────────────────────────────────────────
tenant = db.query(Tenant).first()
if not tenant:
    tenant = Tenant(
        id=uuid.uuid4(),
        name="Axiora Pulse Demo",
        slug="axiora-pulse-demo",
    )
    db.add(tenant)
    db.flush()
    print(f"Created tenant: {tenant.name}")

user = db.query(UserProfile).first()
if not user:
    user = UserProfile(
        id=uuid.uuid4(),
        cognito_sub="seed-user-sub",
        email="founder@axiorapulse.com",
        name="Demo Founder",
        tenant_id=tenant.id,
    )
    db.add(user)
    db.flush()
    print(f"Created user: {user.name}")

# ── 2. Create a meaningful survey with 15 questions ──────────────────────────
survey_id = uuid.uuid4()
survey = Survey(
    id=survey_id,
    title="AxiFlow: Smart Workflow Automation for Indian SMBs",
    description=(
        "A market validation survey for AxiFlow — an AI-powered workflow "
        "automation platform designed for small and medium businesses in India. "
        "We aim to understand pain points, willingness to adopt, pricing "
        "sensitivity, and competitive landscape."
    ),
    slug=f"axiflow-validation-{str(survey_id)[:8]}",
    tenant_id=tenant.id,
    created_by=user.id,
    status="active",
)
db.add(survey)
db.flush()

# 15 questions across all signal categories
questions_data = [
    # ── problem_validation (3 questions) ──
    {
        "question_text": "How frustrated are you with manually managing repetitive business tasks?",
        "question_type": "rating",
        "is_required": True,
    },
    {
        "question_text": "Do you currently struggle with workflow bottlenecks in your daily operations?",
        "question_type": "yes_no",
        "is_required": True,
    },
    {
        "question_text": "What is the biggest pain point you face with your current business processes?",
        "question_type": "long_text",
        "is_required": True,
    },
    # ── market_demand (2 questions) ──
    {
        "question_text": "Would you be interested in trying an AI-powered tool that automates repetitive workflows?",
        "question_type": "yes_no",
        "is_required": True,
    },
    {
        "question_text": "How likely are you to adopt a workflow automation platform within the next 6 months?",
        "question_type": "rating",
        "is_required": True,
    },
    # ── product_market_fit (2 questions) ──
    {
        "question_text": "How satisfied are you with your current workflow management tools?",
        "question_type": "rating",
        "is_required": True,
    },
    {
        "question_text": "Would you recommend a better workflow automation tool to other business owners?",
        "question_type": "yes_no",
        "is_required": True,
    },
    # ── willingness_to_pay (2 questions) ──
    {
        "question_text": "What monthly price would you consider fair for a comprehensive workflow automation tool?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "Under ₹999/month", "value": "Under ₹999/month"},
            {"label": "₹1,000 - ₹2,999/month", "value": "₹1,000 - ₹2,999/month"},
            {"label": "₹3,000 - ₹5,999/month", "value": "₹3,000 - ₹5,999/month"},
            {"label": "₹6,000 - ₹9,999/month", "value": "₹6,000 - ₹9,999/month"},
            {"label": "₹10,000+/month", "value": "₹10,000+/month"},
        ],
    },
    {
        "question_text": "How much do you currently spend on productivity and workflow tools per month?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "₹0 (no tools)", "value": "₹0 (no tools)"},
            {"label": "₹500 - ₹2,000", "value": "₹500 - ₹2,000"},
            {"label": "₹2,000 - ₹5,000", "value": "₹2,000 - ₹5,000"},
            {"label": "₹5,000 - ₹10,000", "value": "₹5,000 - ₹10,000"},
            {"label": "₹10,000+", "value": "₹10,000+"},
        ],
    },
    # ── competitive_positioning (2 questions) ──
    {
        "question_text": "What tools or alternatives do you currently use for task and workflow management?",
        "question_type": "multiple_choice",
        "is_required": True,
        "options": [
            {"label": "Manual spreadsheets (Excel/Google Sheets)", "value": "Manual spreadsheets"},
            {"label": "Trello / Asana / Monday.com", "value": "Trello / Asana / Monday.com"},
            {"label": "WhatsApp / Phone calls", "value": "WhatsApp / Phone calls"},
            {"label": "Custom-built internal tools", "value": "Custom-built tools"},
            {"label": "No tools — fully manual", "value": "No tools"},
        ],
    },
    {
        "question_text": "How satisfied are you with the alternatives or competitor tools you currently use?",
        "question_type": "rating",
        "is_required": True,
    },
    # ── customer_segmentation (2 questions) ──
    {
        "question_text": "What is your role or occupation?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "Founder / CEO", "value": "Founder / CEO"},
            {"label": "Operations Manager", "value": "Operations Manager"},
            {"label": "Product Manager", "value": "Product Manager"},
            {"label": "Team Lead / Manager", "value": "Team Lead / Manager"},
            {"label": "Freelancer / Consultant", "value": "Freelancer / Consultant"},
            {"label": "Other", "value": "Other"},
        ],
    },
    {
        "question_text": "What is your age range?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "18-24", "value": "18-24"},
            {"label": "25-34", "value": "25-34"},
            {"label": "35-44", "value": "35-44"},
            {"label": "45-54", "value": "45-54"},
            {"label": "55+", "value": "55+"},
        ],
    },
    # ── risk_signal (1 question) ──
    {
        "question_text": "What concerns or barriers would prevent you from adopting a new workflow tool?",
        "question_type": "short_text",
        "is_required": True,
    },
    # ── general feedback (1 question) ──
    {
        "question_text": "Any additional feedback or feature requests for a workflow automation platform?",
        "question_type": "long_text",
        "is_required": False,
    },
]

question_objects = []
for idx, qd in enumerate(questions_data):
    q = SurveyQuestion(
        id=uuid.uuid4(),
        survey_id=survey_id,
        question_text=qd["question_text"],
        question_type=qd["question_type"],
        is_required=qd.get("is_required", False),
        sort_order=idx,
        options=qd.get("options"),
    )
    db.add(q)
    question_objects.append(q)
db.flush()
print(f"Created survey: '{survey.title}' with {len(question_objects)} questions")

# ── 3. Submit 57 realistic responses ─────────────────────────────────────────

# Realistic answer pools
CITIES = [
    "Hyderabad",
    "Hyderabad",
    "Hyderabad",
    "Hyderabad",  # Heavy Hyderabad presence
    "Bangalore",
    "Bangalore",
    "Bangalore",
    "Mumbai",
    "Mumbai",
    "Chennai",
    "Delhi",
    "Pune",
    "Kolkata",
    "Ahmedabad",
    "Jaipur",
    "Indore",
]

OCCUPATIONS = [
    "Founder / CEO",
    "Founder / CEO",
    "Founder / CEO",
    "Operations Manager",
    "Operations Manager",
    "Product Manager",
    "Product Manager",
    "Team Lead / Manager",
    "Team Lead / Manager",
    "Freelancer / Consultant",
    "Other",
]

AGE_RANGES = ["18-24", "25-34", "25-34", "25-34", "35-44", "35-44", "45-54", "55+"]

PAIN_POINTS = [
    "Manually tracking tasks across spreadsheets is time-consuming and error-prone",
    "We waste 2-3 hours daily on repetitive data entry and follow-ups",
    "Coordinating between teams via WhatsApp is chaotic — things get lost",
    "No visibility into who is doing what — constant status meetings needed",
    "Invoicing and client follow-ups are completely manual and inconsistent",
    "We tried Trello but our team found it too complex for simple workflows",
    "Hiring process is disorganized — candidate tracking is a nightmare",
    "Inventory management still runs on Excel — often out of sync",
    "Customer onboarding involves 15 manual steps that nobody remembers",
    "Our approval chain for purchase orders takes 3-5 days via email",
    "Sales pipeline tracking is scattered across WhatsApp and spreadsheets",
    "Reporting takes a full day every month — pulling data from 5 sources",
    "We lack standard operating procedures — each person does things differently",
    "Quality control is inconsistent because checklists are paper-based",
    "Project timelines keep slipping because task dependencies are invisible",
]

CONCERNS = [
    "Data security and privacy is my biggest concern",
    "Cost — we're bootstrapped and can't afford expensive tools",
    "Learning curve — my team is not very tech-savvy",
    "Integration with existing tools like Tally and WhatsApp",
    "Worried about vendor lock-in — what if you shut down?",
    "Need Indian language support (Hindi, Telugu, Tamil)",
    "Internet connectivity in tier-2 cities is unreliable",
    "Customization — every business workflow is different",
    "Not sure AI can understand our specific industry processes",
    "We need offline mode for field operations",
]

FEEDBACK = [
    "Love the concept — especially if it integrates with WhatsApp and Tally",
    "Voice-based task creation would be game-changing for field teams",
    "Please support Hindi and regional language interfaces",
    "Mobile-first approach is critical — our team is always on the move",
    "Would love automated reporting that sends weekly summaries",
    "Integration with GST filing tools would be incredibly useful",
    "Make it dead simple — our staff aren't engineers",
    "Gamification or team productivity leaderboards would drive adoption",
    "Built-in time tracking with payroll integration",
    "Need to work well on low-bandwidth connections",
    "",  # Some people skip optional questions
    "",
]

for i in range(57):
    resp_id = uuid.uuid4()
    city = random.choice(CITIES)
    occupation = random.choice(OCCUPATIONS)
    age_range = random.choice(AGE_RANGES)

    response = SurveyResponse(
        id=resp_id,
        survey_id=survey_id,
        session_token=f"seed-{str(resp_id)[:16]}",
        status="completed",
        city=city,
        occupation=occupation,
        age_range=age_range,
        completed_at=datetime.utcnow() - timedelta(hours=random.randint(1, 720)),
    )
    db.add(response)
    db.flush()

    # Generate realistic answers for each question
    for j, q in enumerate(question_objects):
        answer_value = ""

        if j == 0:  # Frustration rating (1-5)
            answer_value = str(random.choices([3, 4, 4, 5, 5, 5, 2, 4, 5, 3], k=1)[0])
        elif j == 1:  # Struggle with bottlenecks (yes/no)
            answer_value = random.choices(["yes", "yes", "yes", "yes", "no", "yes", "no", "yes"], k=1)[0]
        elif j == 2:  # Pain point (long text)
            answer_value = random.choice(PAIN_POINTS)
        elif j == 3:  # Interested in AI tool (yes/no)
            answer_value = random.choices(["yes", "yes", "yes", "yes", "yes", "no", "yes", "yes", "no", "yes"], k=1)[0]
        elif j == 4:  # Adoption likelihood (rating 1-5)
            answer_value = str(random.choices([3, 4, 4, 5, 5, 4, 3, 5, 4, 2], k=1)[0])
        elif j == 5:  # Satisfaction with current tools (1-5, lower = good for us)
            answer_value = str(random.choices([1, 2, 2, 3, 3, 2, 1, 3, 4, 2], k=1)[0])
        elif j == 6:  # Would recommend (yes/no)
            answer_value = random.choices(["yes", "yes", "yes", "yes", "no", "yes", "no", "yes", "yes", "yes"], k=1)[0]
        elif j == 7:  # Fair monthly price
            answer_value = random.choices(
                [
                    "Under ₹999/month",
                    "₹1,000 - ₹2,999/month",
                    "₹1,000 - ₹2,999/month",
                    "₹1,000 - ₹2,999/month",
                    "₹3,000 - ₹5,999/month",
                    "₹3,000 - ₹5,999/month",
                    "₹6,000 - ₹9,999/month",
                    "₹10,000+/month",
                ],
                k=1,
            )[0]
        elif j == 8:  # Current spending
            answer_value = random.choices(
                [
                    "₹0 (no tools)",
                    "₹0 (no tools)",
                    "₹500 - ₹2,000",
                    "₹500 - ₹2,000",
                    "₹500 - ₹2,000",
                    "₹2,000 - ₹5,000",
                    "₹2,000 - ₹5,000",
                    "₹5,000 - ₹10,000",
                    "₹10,000+",
                ],
                k=1,
            )[0]
        elif j == 9:  # Current tools (multiple choice)
            tools = random.sample(
                [
                    "Manual spreadsheets",
                    "Trello / Asana / Monday.com",
                    "WhatsApp / Phone calls",
                    "Custom-built tools",
                    "No tools",
                ],
                k=random.randint(1, 3),
            )
            answer_value = ", ".join(tools)
        elif j == 10:  # Satisfaction with alternatives (1-5, lower = opportunity)
            answer_value = str(random.choices([1, 2, 2, 3, 3, 2, 1, 2, 3, 4], k=1)[0])
        elif j == 11:  # Occupation
            answer_value = occupation
        elif j == 12:  # Age range
            answer_value = age_range
        elif j == 13:  # Concerns (risk signals)
            answer_value = random.choice(CONCERNS)
        elif j == 14:  # Feedback (optional)
            answer_value = random.choice(FEEDBACK)
            if not answer_value:
                continue  # Skip empty optional answers

        answer = SurveyAnswer(
            id=uuid.uuid4(),
            response_id=resp_id,
            question_id=q.id,
            answer_value=answer_value,
        )
        db.add(answer)

    if (i + 1) % 10 == 0:
        db.flush()
        print(f"  Submitted {i + 1}/57 responses...")

db.commit()
print(f"\n✅ Done! Survey '{survey.title}' created with {len(question_objects)} questions and 57 responses.")
print(f"   Survey ID: {str(survey_id)}")
print("   You can now generate the Investor Readiness Report from the frontend.")
