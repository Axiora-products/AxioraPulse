"""
seed_cybersecurity_survey.py
─────────────────────────────
Seeds a comprehensive cybersecurity IT startup survey with 30 questions
covering ALL question types (rating, yes_no, single_choice, multiple_choice,
long_text, short_text, ranking, slider) and submits 55 realistic responses
that read as if filled by actual startup founders.

Linked to user: varshinibobbarala22@gmail.com

Run inside Docker:
  docker exec pulse-backend python seed_cybersecurity_survey.py
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

# ── 1. Ensure tenant and user exist (linked to varshinibobbarala22@gmail.com) ─
TARGET_EMAIL = "varshinibobbarala22@gmail.com"

user = db.query(UserProfile).filter(UserProfile.email == TARGET_EMAIL).first()
if user:
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    print(f"Found existing user: {user.email} (tenant: {tenant.name})")
else:
    # Create tenant and user if they don't exist
    tenant = db.query(Tenant).first()
    if not tenant:
        tenant = Tenant(
            id=uuid.uuid4(),
            name="CyberPulse Ventures",
            slug="cyberpulse-ventures",
        )
        db.add(tenant)
        db.flush()
        print(f"Created tenant: {tenant.name}")

    user = UserProfile(
        id=uuid.uuid4(),
        cognito_sub=f"cyber-survey-{str(uuid.uuid4())[:8]}",
        email=TARGET_EMAIL,
        full_name="Varshini Bobbarala",
        tenant_id=tenant.id,
    )
    db.add(user)
    db.flush()
    print(f"Created user: {user.full_name} ({user.email})")


# ── 2. Create the cybersecurity startup survey with 30 questions ─────────────
survey_id = uuid.uuid4()
survey = Survey(
    id=survey_id,
    title="IT Startup Cybersecurity Investor Readiness Survey 2026",
    description=(
        "A comprehensive investor readiness survey for IT startups in the "
        "cybersecurity domain. Covers company profile, technology stack, "
        "funding landscape, market challenges, competitive positioning, "
        "and future outlook. Designed to validate market signals and "
        "assess startup maturity for investor due diligence."
    ),
    slug=f"cybersecurity-investor-survey-{str(survey_id)[:8]}",
    tenant_id=tenant.id,
    created_by=user.id,
    status="active",
)
db.add(survey)
db.flush()

# ── 30 questions across all types and categories ─────────────────────────────
questions_data = [
    # ════════════════════════════════════════════════════════════════════════
    # SECTION 1: COMPANY PROFILE (Q1–Q5)
    # ════════════════════════════════════════════════════════════════════════
    {  # Q1
        "question_text": "What stage is your cybersecurity startup currently in?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "Idea / Pre-seed", "value": "Idea / Pre-seed"},
            {"label": "Seed Stage", "value": "Seed Stage"},
            {"label": "Series A", "value": "Series A"},
            {"label": "Series B", "value": "Series B"},
            {"label": "Series C+", "value": "Series C+"},
            {"label": "Growth / Scale-up", "value": "Growth / Scale-up"},
        ],
    },
    {  # Q2
        "question_text": "How many employees does your startup currently have?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "1–5 (Solo / Co-founders)", "value": "1–5"},
            {"label": "6–15", "value": "6–15"},
            {"label": "16–50", "value": "16–50"},
            {"label": "51–100", "value": "51–100"},
            {"label": "101–250", "value": "101–250"},
            {"label": "250+", "value": "250+"},
        ],
    },
    {  # Q3
        "question_text": "What is your startup's annual revenue range?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "Pre-revenue", "value": "Pre-revenue"},
            {"label": "Under $100K", "value": "Under $100K"},
            {"label": "$100K – $500K", "value": "$100K – $500K"},
            {"label": "$500K – $2M", "value": "$500K – $2M"},
            {"label": "$2M – $10M", "value": "$2M – $10M"},
            {"label": "$10M+", "value": "$10M+"},
        ],
    },
    {  # Q4
        "question_text": "When was your cybersecurity startup founded?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "Before 2018", "value": "Before 2018"},
            {"label": "2018–2020", "value": "2018–2020"},
            {"label": "2021–2022", "value": "2021–2022"},
            {"label": "2023–2024", "value": "2023–2024"},
            {"label": "2025–2026", "value": "2025–2026"},
        ],
    },
    {  # Q5
        "question_text": "What is your primary cybersecurity domain?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "Cloud Security", "value": "Cloud Security"},
            {"label": "Endpoint Security", "value": "Endpoint Security"},
            {"label": "Identity & Access Management", "value": "IAM"},
            {"label": "Threat Detection & Response", "value": "Threat Detection"},
            {"label": "Application Security", "value": "AppSec"},
            {"label": "Data Privacy & Compliance", "value": "Data Privacy"},
            {"label": "Network Security", "value": "Network Security"},
            {"label": "IoT / OT Security", "value": "IoT Security"},
        ],
    },

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 2: TECHNOLOGY & PRODUCT (Q6–Q12)
    # ════════════════════════════════════════════════════════════════════════
    {  # Q6
        "question_text": "Who is your primary target customer segment?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "Small & Medium Businesses (SMBs)", "value": "SMBs"},
            {"label": "Mid-Market Enterprises", "value": "Mid-Market"},
            {"label": "Large Enterprises (Fortune 500)", "value": "Large Enterprise"},
            {"label": "Government & Public Sector", "value": "Government"},
            {"label": "Managed Service Providers (MSPs)", "value": "MSPs"},
            {"label": "Individual Consumers", "value": "Consumers"},
        ],
    },
    {  # Q7
        "question_text": "Which cybersecurity frameworks does your product align with? (Select all that apply)",
        "question_type": "multiple_choice",
        "is_required": True,
        "options": [
            {"label": "NIST Cybersecurity Framework", "value": "NIST CSF"},
            {"label": "ISO 27001", "value": "ISO 27001"},
            {"label": "SOC 2 Type II", "value": "SOC 2"},
            {"label": "MITRE ATT&CK", "value": "MITRE ATT&CK"},
            {"label": "CIS Controls", "value": "CIS Controls"},
            {"label": "Zero Trust Architecture", "value": "Zero Trust"},
            {"label": "GDPR", "value": "GDPR"},
        ],
    },
    {  # Q8
        "question_text": "What core technologies does your product use? (Select all that apply)",
        "question_type": "multiple_choice",
        "is_required": True,
        "options": [
            {"label": "Machine Learning / AI", "value": "ML/AI"},
            {"label": "Blockchain", "value": "Blockchain"},
            {"label": "Cloud-Native (Kubernetes, Serverless)", "value": "Cloud-Native"},
            {"label": "Big Data Analytics", "value": "Big Data"},
            {"label": "Behavioral Analytics", "value": "Behavioral Analytics"},
            {"label": "Encryption / Cryptography", "value": "Encryption"},
            {"label": "Zero Trust Architecture", "value": "Zero Trust"},
        ],
    },
    {  # Q9
        "question_text": "Do you use AI/ML in your cybersecurity solution?",
        "question_type": "yes_no",
        "is_required": True,
    },
    {  # Q10
        "question_text": "Rate the maturity level of your core product on a scale of 1–10.",
        "question_type": "rating",
        "is_required": True,
    },
    {  # Q11
        "question_text": "How do you primarily deploy your solution?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "SaaS (Cloud-hosted)", "value": "SaaS"},
            {"label": "On-Premises", "value": "On-Premises"},
            {"label": "Hybrid (Cloud + On-Prem)", "value": "Hybrid"},
            {"label": "Open Source + Enterprise", "value": "Open Source"},
            {"label": "API-first / Embedded", "value": "API-first"},
        ],
    },
    {  # Q12
        "question_text": "Does your product offer real-time threat detection capabilities?",
        "question_type": "yes_no",
        "is_required": True,
    },

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 3: FUNDING & FINANCE (Q13–Q17)
    # ════════════════════════════════════════════════════════════════════════
    {  # Q13
        "question_text": "What is your total funding raised to date?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "Bootstrapped (No external funding)", "value": "Bootstrapped"},
            {"label": "Under $500K", "value": "Under $500K"},
            {"label": "$500K – $2M", "value": "$500K – $2M"},
            {"label": "$2M – $10M", "value": "$2M – $10M"},
            {"label": "$10M – $50M", "value": "$10M – $50M"},
            {"label": "$50M+", "value": "$50M+"},
        ],
    },
    {  # Q14
        "question_text": "What is your primary funding source?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "Angel Investors", "value": "Angel Investors"},
            {"label": "Venture Capital (VC)", "value": "VC"},
            {"label": "Government Grants", "value": "Government Grants"},
            {"label": "Corporate VC / Strategic Investor", "value": "Corporate VC"},
            {"label": "Bootstrapped / Revenue-funded", "value": "Bootstrapped"},
            {"label": "Crowdfunding", "value": "Crowdfunding"},
        ],
    },
    {  # Q15
        "question_text": "Is your startup currently profitable?",
        "question_type": "yes_no",
        "is_required": True,
    },
    {  # Q16
        "question_text": "What is your monthly burn rate?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "Under $10K/month", "value": "Under $10K"},
            {"label": "$10K – $50K/month", "value": "$10K – $50K"},
            {"label": "$50K – $150K/month", "value": "$50K – $150K"},
            {"label": "$150K – $500K/month", "value": "$150K – $500K"},
            {"label": "$500K+/month", "value": "$500K+"},
        ],
    },
    {  # Q17
        "question_text": "How confident are you in securing your next funding round?",
        "question_type": "slider",
        "is_required": True,
    },

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 4: CHALLENGES & GROWTH (Q18–Q22)
    # ════════════════════════════════════════════════════════════════════════
    {  # Q18
        "question_text": "What is your single biggest operational challenge?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "Hiring skilled cybersecurity talent", "value": "Talent Acquisition"},
            {"label": "Long enterprise sales cycles", "value": "Sales Cycles"},
            {"label": "Building trust with customers", "value": "Customer Trust"},
            {"label": "Product-market fit validation", "value": "PMF Validation"},
            {"label": "Scaling infrastructure", "value": "Scaling"},
            {"label": "Regulatory compliance", "value": "Compliance"},
            {"label": "Competing with established vendors", "value": "Competition"},
        ],
    },
    {  # Q19
        "question_text": "Rate the difficulty of hiring skilled cybersecurity talent (1=Easy, 5=Extremely Difficult).",
        "question_type": "rating",
        "is_required": True,
    },
    {  # Q20
        "question_text": "What is your primary customer acquisition strategy?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "Content Marketing & Thought Leadership", "value": "Content Marketing"},
            {"label": "Direct Enterprise Sales", "value": "Direct Sales"},
            {"label": "Channel Partners & Resellers", "value": "Channel Partners"},
            {"label": "Product-Led Growth (PLG)", "value": "PLG"},
            {"label": "Community & Open Source", "value": "Community"},
            {"label": "Events & Conferences", "value": "Events"},
        ],
    },
    {  # Q21
        "question_text": "What is your year-over-year revenue growth rate?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "Not yet generating revenue", "value": "Pre-revenue"},
            {"label": "0% – 25%", "value": "0–25%"},
            {"label": "26% – 50%", "value": "26–50%"},
            {"label": "51% – 100%", "value": "51–100%"},
            {"label": "100% – 200% (Hyper-growth)", "value": "100–200%"},
            {"label": "200%+ (Explosive growth)", "value": "200%+"},
        ],
    },
    {  # Q22
        "question_text": "Rank these growth priorities from highest to lowest importance.",
        "question_type": "ranking",
        "is_required": True,
        "options": [
            {"label": "Product Development & R&D", "value": "Product R&D"},
            {"label": "Customer Acquisition", "value": "Customer Acquisition"},
            {"label": "Team Expansion", "value": "Team Expansion"},
            {"label": "Geographic Expansion", "value": "Geo Expansion"},
            {"label": "Strategic Partnerships", "value": "Partnerships"},
        ],
    },

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 5: MARKET & COMPETITION (Q23–Q26)
    # ════════════════════════════════════════════════════════════════════════
    {  # Q23
        "question_text": "How saturated is your specific market segment? (1=Wide Open, 5=Extremely Crowded)",
        "question_type": "rating",
        "is_required": True,
    },
    {  # Q24
        "question_text": "How many direct competitors do you face in your niche?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "0–2 (Blue ocean)", "value": "0–2"},
            {"label": "3–5", "value": "3–5"},
            {"label": "6–10", "value": "6–10"},
            {"label": "11–20", "value": "11–20"},
            {"label": "20+ (Highly competitive)", "value": "20+"},
        ],
    },
    {  # Q25
        "question_text": "Which compliance standards does your product support? (Select all that apply)",
        "question_type": "multiple_choice",
        "is_required": True,
        "options": [
            {"label": "SOC 2", "value": "SOC 2"},
            {"label": "ISO 27001", "value": "ISO 27001"},
            {"label": "GDPR", "value": "GDPR"},
            {"label": "HIPAA", "value": "HIPAA"},
            {"label": "PCI DSS", "value": "PCI DSS"},
            {"label": "FedRAMP", "value": "FedRAMP"},
            {"label": "CCPA", "value": "CCPA"},
        ],
    },
    {  # Q26
        "question_text": "How has regulation impacted your business growth?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "Very Positively – drives demand for our product", "value": "Very Positive"},
            {"label": "Somewhat Positively", "value": "Somewhat Positive"},
            {"label": "Neutral – no significant impact", "value": "Neutral"},
            {"label": "Somewhat Negatively – slows us down", "value": "Somewhat Negative"},
            {"label": "Very Negatively – major obstacle", "value": "Very Negative"},
        ],
    },

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 6: FUTURE OUTLOOK (Q27–Q30)
    # ════════════════════════════════════════════════════════════════════════
    {  # Q27
        "question_text": "Do you plan to expand internationally within the next 2 years?",
        "question_type": "yes_no",
        "is_required": True,
    },
    {  # Q28
        "question_text": "What is your preferred 3-year exit strategy?",
        "question_type": "single_choice",
        "is_required": True,
        "options": [
            {"label": "Acquisition by a larger cybersecurity firm", "value": "Acquisition"},
            {"label": "IPO / Public listing", "value": "IPO"},
            {"label": "Continue scaling independently", "value": "Scale Independently"},
            {"label": "Strategic merger", "value": "Merger"},
            {"label": "No specific exit plan yet", "value": "No Plan"},
        ],
    },
    {  # Q29
        "question_text": "How confident are you in your startup's long-term success? (1=Not Confident, 5=Extremely Confident)",
        "question_type": "rating",
        "is_required": True,
    },
    {  # Q30
        "question_text": "What is the single best advice you would give to a new cybersecurity startup founder?",
        "question_type": "long_text",
        "is_required": True,
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


# ── 3. Submit 55 realistic founder responses ─────────────────────────────────

# ── Founder-like data pools ──────────────────────────────────────────────────

FOUNDER_NAMES = [
    "Arjun Mehta", "Priya Sharma", "Rahul Kapoor", "Sneha Reddy", "Vikram Singh",
    "Ananya Iyer", "Karthik Nair", "Pooja Gupta", "Rohan Das", "Meera Patel",
    "Aditya Joshi", "Divya Krishnan", "Nikhil Rao", "Swati Choudhary", "Amit Verma",
    "Kavya Sundaram", "Siddharth Bhat", "Neha Agarwal", "Rajesh Menon", "Lakshmi Pillai",
    "Harish Kumar", "Tanvi Deshmukh", "Aman Malik", "Ishita Banerjee", "Varun Tiwari",
    "Ritika Sinha", "Deepak Rajan", "Shruti Mishra", "Ashwin Naik", "Preeti Saxena",
    "Manish Pandey", "Anushka Jain", "Gaurav Chopra", "Ritu Devi", "Suresh Babu",
    "Megha Kulkarni", "Tarun Bhardwaj", "Sanya Kaul", "Pranav Hegde", "Bhavna Sethi",
    "Ajay Mohan", "Nidhi Rastogi", "Abhishek Thapar", "Simran Kohli", "Vivek Menon",
    "Pallavi Garg", "Sachin Chauhan", "Aparna Nambiar", "Kunal Datta", "Jyoti Kumari",
    "Ramesh Venkat", "Faizan Ahmed", "Sonam Wangchuk", "Rakhi Goswami", "Dev Narayan",
]

CITIES = [
    "Bangalore", "Bangalore", "Bangalore", "Bangalore",
    "Hyderabad", "Hyderabad", "Hyderabad",
    "Mumbai", "Mumbai", "Mumbai",
    "Delhi NCR", "Delhi NCR",
    "Pune", "Pune",
    "Chennai", "Chennai",
    "Kochi", "Kolkata", "Ahmedabad", "Jaipur",
    "San Francisco", "Tel Aviv", "London", "Singapore",
]

# Q1: Startup Stage — weighted toward Seed and Series A
STAGE_POOL = [
    "Idea / Pre-seed", "Idea / Pre-seed", "Idea / Pre-seed",
    "Seed Stage", "Seed Stage", "Seed Stage", "Seed Stage", "Seed Stage",
    "Seed Stage", "Seed Stage", "Seed Stage", "Seed Stage",
    "Series A", "Series A", "Series A", "Series A", "Series A",
    "Series A", "Series A",
    "Series B", "Series B", "Series B", "Series B",
    "Series C+", "Series C+",
    "Growth / Scale-up", "Growth / Scale-up", "Growth / Scale-up",
]

# Q2: Employee Count
EMPLOYEES_MAP = {
    "Idea / Pre-seed": ["1–5", "1–5", "1–5", "6–15"],
    "Seed Stage": ["1–5", "6–15", "6–15", "6–15", "16–50"],
    "Series A": ["6–15", "16–50", "16–50", "16–50", "51–100"],
    "Series B": ["16–50", "51–100", "51–100", "101–250"],
    "Series C+": ["51–100", "101–250", "101–250", "250+"],
    "Growth / Scale-up": ["101–250", "101–250", "250+", "250+"],
}

# Q3: Revenue
REVENUE_MAP = {
    "Idea / Pre-seed": ["Pre-revenue", "Pre-revenue", "Pre-revenue", "Under $100K"],
    "Seed Stage": ["Pre-revenue", "Under $100K", "Under $100K", "$100K – $500K"],
    "Series A": ["$100K – $500K", "$100K – $500K", "$500K – $2M", "$500K – $2M"],
    "Series B": ["$500K – $2M", "$2M – $10M", "$2M – $10M", "$2M – $10M"],
    "Series C+": ["$2M – $10M", "$2M – $10M", "$10M+", "$10M+"],
    "Growth / Scale-up": ["$2M – $10M", "$10M+", "$10M+", "$10M+"],
}

# Q4: Founded year
FOUNDED_POOL = [
    "Before 2018", "Before 2018", "Before 2018",
    "2018–2020", "2018–2020", "2018–2020", "2018–2020",
    "2021–2022", "2021–2022", "2021–2022", "2021–2022", "2021–2022",
    "2023–2024", "2023–2024", "2023–2024", "2023–2024", "2023–2024", "2023–2024",
    "2025–2026", "2025–2026", "2025–2026",
]

# Q5: Cybersecurity domain
DOMAIN_POOL = [
    "Cloud Security", "Cloud Security", "Cloud Security", "Cloud Security",
    "Threat Detection", "Threat Detection", "Threat Detection",
    "IAM", "IAM", "IAM",
    "AppSec", "AppSec", "AppSec",
    "Data Privacy", "Data Privacy",
    "Endpoint Security", "Endpoint Security",
    "Network Security", "Network Security",
    "IoT Security",
]

# Q6: Target customer
TARGET_MAP = {
    "Idea / Pre-seed": ["SMBs", "SMBs", "Consumers", "Mid-Market"],
    "Seed Stage": ["SMBs", "SMBs", "Mid-Market", "Mid-Market", "MSPs"],
    "Series A": ["Mid-Market", "Mid-Market", "Large Enterprise", "SMBs"],
    "Series B": ["Mid-Market", "Large Enterprise", "Large Enterprise", "Government"],
    "Series C+": ["Large Enterprise", "Large Enterprise", "Government"],
    "Growth / Scale-up": ["Large Enterprise", "Government", "Mid-Market", "MSPs"],
}

# Q7: Frameworks (multi-select) — each respondent picks 2–4
FRAMEWORKS = ["NIST CSF", "ISO 27001", "SOC 2", "MITRE ATT&CK", "CIS Controls", "Zero Trust", "GDPR"]

# Q8: Technologies (multi-select) — each respondent picks 2–4
TECH_STACK = ["ML/AI", "Blockchain", "Cloud-Native", "Big Data", "Behavioral Analytics", "Encryption", "Zero Trust"]

# Q11: Deployment model
DEPLOYMENT_MAP = {
    "SMBs": ["SaaS", "SaaS", "SaaS", "API-first"],
    "Mid-Market": ["SaaS", "SaaS", "Hybrid", "API-first"],
    "Large Enterprise": ["Hybrid", "On-Premises", "SaaS", "Hybrid"],
    "Government": ["On-Premises", "On-Premises", "Hybrid"],
    "MSPs": ["SaaS", "SaaS", "API-first"],
    "Consumers": ["SaaS", "SaaS", "Open Source"],
}

# Q13: Funding raised
FUNDING_MAP = {
    "Idea / Pre-seed": ["Bootstrapped", "Bootstrapped", "Under $500K"],
    "Seed Stage": ["Under $500K", "Under $500K", "$500K – $2M", "Bootstrapped"],
    "Series A": ["$2M – $10M", "$2M – $10M", "$500K – $2M"],
    "Series B": ["$10M – $50M", "$10M – $50M", "$2M – $10M"],
    "Series C+": ["$10M – $50M", "$50M+", "$50M+"],
    "Growth / Scale-up": ["$10M – $50M", "$50M+", "$50M+"],
}

# Q14: Funding source
FUNDING_SRC_MAP = {
    "Bootstrapped": ["Bootstrapped", "Bootstrapped", "Angel Investors"],
    "Under $500K": ["Angel Investors", "Angel Investors", "Government Grants", "Bootstrapped"],
    "$500K – $2M": ["Angel Investors", "VC", "VC", "Government Grants"],
    "$2M – $10M": ["VC", "VC", "VC", "Corporate VC"],
    "$10M – $50M": ["VC", "VC", "Corporate VC"],
    "$50M+": ["VC", "VC", "Corporate VC"],
}

# Q16: Burn rate
BURN_MAP = {
    "Idea / Pre-seed": ["Under $10K", "Under $10K"],
    "Seed Stage": ["Under $10K", "$10K – $50K", "$10K – $50K"],
    "Series A": ["$10K – $50K", "$50K – $150K", "$50K – $150K"],
    "Series B": ["$50K – $150K", "$150K – $500K", "$150K – $500K"],
    "Series C+": ["$150K – $500K", "$500K+", "$500K+"],
    "Growth / Scale-up": ["$150K – $500K", "$500K+", "$500K+"],
}

# Q18: Biggest challenge
CHALLENGE_POOL = [
    "Talent Acquisition", "Talent Acquisition", "Talent Acquisition", "Talent Acquisition",
    "Sales Cycles", "Sales Cycles", "Sales Cycles",
    "Customer Trust", "Customer Trust",
    "PMF Validation", "PMF Validation",
    "Scaling", "Scaling",
    "Compliance", "Compliance",
    "Competition",
]

# Q20: Customer acquisition strategy
ACQ_STRATEGY_POOL = [
    "Content Marketing", "Content Marketing", "Content Marketing",
    "Direct Sales", "Direct Sales", "Direct Sales", "Direct Sales",
    "Channel Partners", "Channel Partners",
    "PLG", "PLG", "PLG",
    "Community", "Community",
    "Events",
]

# Q21: YoY growth
GROWTH_MAP = {
    "Idea / Pre-seed": ["Pre-revenue", "Pre-revenue", "Pre-revenue"],
    "Seed Stage": ["Pre-revenue", "0–25%", "0–25%", "26–50%"],
    "Series A": ["26–50%", "51–100%", "51–100%", "100–200%"],
    "Series B": ["51–100%", "100–200%", "100–200%", "200%+"],
    "Series C+": ["51–100%", "100–200%", "200%+"],
    "Growth / Scale-up": ["26–50%", "51–100%", "100–200%"],
}

# Q24: Number of competitors
COMPETITOR_POOL = [
    "0–2", "0–2",
    "3–5", "3–5", "3–5", "3–5", "3–5",
    "6–10", "6–10", "6–10", "6–10",
    "11–20", "11–20",
    "20+", "20+",
]

# Q25: Compliance standards (multi-select)
COMPLIANCE_STD = ["SOC 2", "ISO 27001", "GDPR", "HIPAA", "PCI DSS", "FedRAMP", "CCPA"]

# Q26: Regulation impact
REG_IMPACT_POOL = [
    "Very Positive", "Very Positive", "Very Positive", "Very Positive",
    "Somewhat Positive", "Somewhat Positive", "Somewhat Positive", "Somewhat Positive",
    "Neutral", "Neutral", "Neutral",
    "Somewhat Negative", "Somewhat Negative",
    "Very Negative",
]

# Q28: Exit strategy
EXIT_MAP = {
    "Idea / Pre-seed": ["No Plan", "No Plan", "Scale Independently", "Acquisition"],
    "Seed Stage": ["Scale Independently", "Scale Independently", "Acquisition", "No Plan"],
    "Series A": ["Scale Independently", "Acquisition", "Acquisition", "IPO"],
    "Series B": ["Acquisition", "IPO", "Scale Independently", "Merger"],
    "Series C+": ["IPO", "IPO", "Acquisition", "Merger"],
    "Growth / Scale-up": ["IPO", "Scale Independently", "Acquisition"],
}

# Q30: Founder advice (long text — realistic and diverse)
FOUNDER_ADVICE = [
    "Focus on solving one specific pain point brilliantly rather than building a Swiss Army knife of security tools. Our first product was too broad — the moment we narrowed to cloud workload protection, everything clicked.",
    "Don't underestimate the enterprise sales cycle in cybersecurity. Budget for 9–12 months minimum. Build relationships with CISOs early — they're your champions internally.",
    "Hire security practitioners, not just software engineers. The best product decisions come from people who've been in the SOC at 2 AM responding to an actual breach.",
    "Get SOC 2 certified as early as possible. We lost three deals in our first year because we didn't have it. It's table stakes for any B2B cybersecurity startup.",
    "Build trust before building features. In security, nobody buys from a startup they don't trust. Publish research, contribute to open-source projects, speak at conferences.",
    "Your first 10 customers are everything. Don't do paid marketing — go door to door if you have to. Those initial reference customers will sell your product for you.",
    "Revenue is oxygen. We almost died chasing vanity metrics. Focus on ARR from day one, even if it means doing things that don't scale initially.",
    "The cybersecurity talent shortage is real. Consider building in tier-2 cities or hiring globally remote. Don't limit yourself to Bangalore and the Bay Area.",
    "Compliance drives purchase decisions in enterprise security. If your product helps a CISO check compliance boxes AND improve security, you've won.",
    "Don't try to compete with Palo Alto or CrowdStrike head-on. Find the gap they're ignoring — for us it was API security for fintechs — and own that niche completely.",
    "Build your product like you're the attacker. The best cybersecurity founders I know think offense-first. Understand how things break before you sell how to fix them.",
    "Partner with MSSPs and system integrators early. They have the customer relationships and trust you haven't built yet. Give them generous margins — it pays off long-term.",
    "Cybersecurity is a relationship business. Your personal brand as a founder matters more than your company brand in the early days. Be visible, be vocal, be credible.",
    "Don't over-engineer your MVP. Ship a focused solution that solves one critical problem. We spent 14 months building our first version — should have shipped in 4 and iterated.",
    "Data is your moat. The more threat data your product processes, the smarter it gets. Design your architecture to learn from every deployment from day one.",
    "Raise more capital than you think you need. Cybersecurity startups take longer to reach profitability because of long sales cycles and the trust barrier. Our 18-month runway saved us.",
    "Understand regulatory tailwinds. DPDP Act in India, NIS2 in Europe, SEC rules in the US — these mandates are creating massive demand. Position your product to ride these waves.",
    "Focus on time-to-value for your customers. If a CISO can't show value to their board within 90 days, they'll churn. Make your product prove ROI fast.",
    "Don't neglect the mid-market. Everyone chases enterprise, but mid-market companies have serious security needs, shorter sales cycles, and less vendor lock-in.",
    "Build integrations early. Your product needs to work within the customer's existing security stack — SIEMs, SOAR platforms, cloud providers. Nobody rips and replaces anymore.",
    "Invest heavily in customer success. In cybersecurity, a churned customer is also a reputation risk. Make sure every customer is wildly successful — they become your sales team.",
    "The Indian cybersecurity market is exploding. Don't just look West — there's massive opportunity domestically with digital transformation and compliance requirements here.",
    "Use open-source as your wedge. We open-sourced our detection engine, built a community of 5K+ users, and converted 200+ to paid enterprise customers.",
    "Automate everything in your internal operations too. As a security company, your own security posture is constantly under scrutiny. Practice what you preach.",
    "Build for the CISO's reporting needs, not just the analyst's detection needs. The buying decision happens in the boardroom, not the SOC. Show business impact metrics.",
    "Stay close to the threat landscape. What's emerging today becomes tomorrow's billion-dollar market. We pivoted to AI security when we saw LLM adoption exploding — best decision ever.",
    "Don't burn cash on flashy brand marketing early on. In cybersecurity, credibility comes from technical content — whitepapers, CVE research, and community engagement.",
    "Test your pricing with real customers, not assumptions. We discovered our SMB tier was priced too low — customers actually valued us more when we increased prices by 40%.",
    "Find a co-founder with complementary skills. Having both a deep security technical founder and a business/GTM founder is incredibly powerful.",
    "Patience is critical. It took us 18 months to land our first enterprise deal. But once we had that logo, the next 10 came in 6 months. The flywheel is real.",
    "Build vertical-specific solutions. 'Cybersecurity for healthcare' or 'security for fintech' beats 'general cybersecurity platform' in positioning and sales conversations.",
    "Network aggressively with other cybersecurity founders. This community is tight-knit and collaborative. Some of our best features came from conversations with non-competing founders.",
    "Make security accessible, not intimidating. The biggest market gap is cybersecurity for non-technical decision-makers. If your UI requires a PhD to use, you've already lost.",
    "Don't ignore the channel. 65% of enterprise security is sold through partners. We fought this for 2 years and wasted time trying to go direct-only.",
    "Measure everything from day one — not just product metrics, but sales velocity, CAC, LTV, NRR. Investors want to see you understand your unit economics.",
    "AI is reshaping cybersecurity — both as a threat and an opportunity. If you're not incorporating AI into your product roadmap, you'll be disrupted within 2 years.",
    "Regulatory compliance is not just a feature — it's a growth strategy. Every new regulation creates a new budget line for security teams.",
    "Build an advisory board with ex-CISOs. They'll open doors you can't open yourself and provide product feedback that's worth its weight in gold.",
    "Customer education is part of your product. Offer training, certifications, and resources. The more your customers learn, the stickier your product becomes.",
    "Start global from day one. Cyber threats don't respect borders, and neither should your product. We designed for multi-region compliance from the start.",
    "Be honest about what your product can and cannot do. In cybersecurity, overpromising destroys trust permanently. Under-promise and over-deliver.",
    "Don't skip threat modeling during product development. As a cybersecurity vendor, any vulnerability in YOUR product is a catastrophic reputation event.",
    "Join accelerators like CyLon, Techstars, or NASSCOM's programs. The network and mentorship accelerated our growth more than any single feature we built.",
    "Create a culture of continuous learning. The threat landscape changes weekly — your team needs to be learning constantly. Invest in training budgets.",
    "Focus on net revenue retention over new logo acquisition. Expanding within existing accounts is 5x cheaper than acquiring new customers.",
    "When hiring, look for people who've worked at both large security companies and startups. They bring process discipline AND hustle — a rare and valuable combination.",
    "Documentation and developer experience matter enormously. Security teams evaluate products on API docs quality as much as features. Treat your docs like a product.",
    "Build with privacy-by-design principles. Don't collect data you don't need. Your customers are trusting you with their security — respect that responsibility.",
    "Think about exit scenarios early, even if exit is years away. Structure your IP, contracts, and cap table to be acquisition-ready. It gives you leverage in negotiations.",
    "Be prepared for the long game. Cybersecurity isn't a move-fast-and-break-things space. Building lasting trust takes years, but the rewards are massive.",
    "Secure your first government contract — even if it's small. Government logos on your website immediately elevate your credibility with enterprise buyers.",
    "Run red team exercises against your own product quarterly. Nothing builds customer confidence like saying 'we actively try to break our own product and here are the results.'",
    "Don't forget about the human element. 90% of breaches involve human error. Products that address the human factor have an enormous market.",
    "Community building is underrated. Our Slack community of 3000+ security practitioners generates more leads than our entire paid marketing budget.",
    "Embrace transparency in your security practices. Publish your incident response playbook, share your architecture decisions, and be open about your own security posture.",
]

# Occupation pools (these are founders filling the survey)
OCCUPATION_POOL = [
    "Founder / CEO", "Founder / CEO", "Founder / CEO", "Founder / CEO",
    "Co-Founder / CTO", "Co-Founder / CTO", "Co-Founder / CTO",
    "Founder / CISO", "Founder / CISO",
    "Co-Founder / CPO",
    "Founding Engineer",
]

AGE_RANGES = [
    "25-34", "25-34", "25-34", "25-34", "25-34",
    "35-44", "35-44", "35-44", "35-44",
    "45-54", "45-54",
    "18-24",
]


# ── Generate 55 responses ────────────────────────────────────────────────────
for i in range(55):
    resp_id = uuid.uuid4()
    city = random.choice(CITIES)
    occupation = random.choice(OCCUPATION_POOL)
    age_range = random.choice(AGE_RANGES)
    founder_name = FOUNDER_NAMES[i]

    # Core attributes that drive other answers
    stage = random.choice(STAGE_POOL)
    employees = random.choice(EMPLOYEES_MAP[stage])
    revenue = random.choice(REVENUE_MAP[stage])
    domain = random.choice(DOMAIN_POOL)
    target = random.choice(TARGET_MAP[stage])
    funding = random.choice(FUNDING_MAP[stage])
    funding_src = random.choice(FUNDING_SRC_MAP[funding])

    response = SurveyResponse(
        id=resp_id,
        survey_id=survey_id,
        session_token=f"cyber-{str(resp_id)[:16]}",
        status="completed",
        city=city,
        occupation=occupation,
        age_range=age_range,
        completed_at=datetime.utcnow() - timedelta(hours=random.randint(1, 720)),
    )
    db.add(response)
    db.flush()

    # Generate answer for each of the 30 questions
    for j, q in enumerate(question_objects):
        answer_value = ""
        answer_json = None

        if j == 0:    # Q1: Startup stage
            answer_value = stage
        elif j == 1:  # Q2: Employee count
            answer_value = employees
        elif j == 2:  # Q3: Revenue range
            answer_value = revenue
        elif j == 3:  # Q4: Founded year
            answer_value = random.choice(FOUNDED_POOL)
        elif j == 4:  # Q5: Cybersecurity domain
            answer_value = domain
        elif j == 5:  # Q6: Target customer
            answer_value = target
        elif j == 6:  # Q7: Frameworks (multiple_choice)
            selected = random.sample(FRAMEWORKS, k=random.randint(2, 4))
            answer_value = ", ".join(selected)
            answer_json = selected
        elif j == 7:  # Q8: Technologies (multiple_choice)
            selected = random.sample(TECH_STACK, k=random.randint(2, 4))
            answer_value = ", ".join(selected)
            answer_json = selected
        elif j == 8:  # Q9: AI/ML usage (yes_no)
            answer_value = random.choices(
                ["yes", "yes", "yes", "yes", "yes", "yes", "yes", "no", "no", "no"],
                k=1
            )[0]
        elif j == 9:  # Q10: Product maturity (rating 1–5)
            maturity_map = {
                "Idea / Pre-seed": [1, 1, 2, 2],
                "Seed Stage": [2, 2, 3, 3],
                "Series A": [3, 3, 4, 4],
                "Series B": [3, 4, 4, 5],
                "Series C+": [4, 4, 5, 5],
                "Growth / Scale-up": [4, 5, 5, 5],
            }
            answer_value = str(random.choice(maturity_map[stage]))
        elif j == 10:  # Q11: Deployment model
            answer_value = random.choice(DEPLOYMENT_MAP[target])
        elif j == 11:  # Q12: Real-time threat detection (yes_no)
            rt_map = {
                "Cloud Security": ["yes", "yes", "yes", "no"],
                "Threat Detection": ["yes", "yes", "yes", "yes"],
                "IAM": ["no", "yes", "yes", "no"],
                "AppSec": ["no", "no", "yes", "no"],
                "Data Privacy": ["no", "no", "no", "yes"],
                "Endpoint Security": ["yes", "yes", "yes", "no"],
                "Network Security": ["yes", "yes", "yes", "yes"],
                "IoT Security": ["yes", "yes", "no", "no"],
            }
            answer_value = random.choice(rt_map[domain])
        elif j == 12:  # Q13: Funding raised
            answer_value = funding
        elif j == 13:  # Q14: Funding source
            answer_value = funding_src
        elif j == 14:  # Q15: Profitable? (yes_no)
            profit_map = {
                "Idea / Pre-seed": ["no", "no", "no", "no"],
                "Seed Stage": ["no", "no", "no", "no", "yes"],
                "Series A": ["no", "no", "yes", "no"],
                "Series B": ["no", "yes", "yes", "no"],
                "Series C+": ["yes", "yes", "no", "yes"],
                "Growth / Scale-up": ["yes", "yes", "yes", "no"],
            }
            answer_value = random.choice(profit_map[stage])
        elif j == 15:  # Q16: Monthly burn rate
            answer_value = random.choice(BURN_MAP[stage])
        elif j == 16:  # Q17: Funding confidence (slider 1–5)
            conf_map = {
                "Idea / Pre-seed": [2, 2, 3, 3],
                "Seed Stage": [3, 3, 4, 3],
                "Series A": [3, 4, 4, 5],
                "Series B": [4, 4, 5, 5],
                "Series C+": [4, 5, 5, 5],
                "Growth / Scale-up": [3, 4, 4, 5],
            }
            answer_value = str(random.choice(conf_map[stage]))
        elif j == 17:  # Q18: Biggest challenge
            answer_value = random.choice(CHALLENGE_POOL)
        elif j == 18:  # Q19: Talent hiring difficulty (rating 1–5)
            answer_value = str(random.choices([3, 4, 4, 4, 5, 5, 5, 3, 4, 5], k=1)[0])
        elif j == 19:  # Q20: Customer acquisition strategy
            answer_value = random.choice(ACQ_STRATEGY_POOL)
        elif j == 20:  # Q21: YoY growth
            answer_value = random.choice(GROWTH_MAP[stage])
        elif j == 21:  # Q22: Ranking (ranking type)
            priorities = ["Product R&D", "Customer Acquisition", "Team Expansion", "Geo Expansion", "Partnerships"]
            random.shuffle(priorities)
            ranked = {p: idx + 1 for idx, p in enumerate(priorities)}
            answer_json = ranked
            answer_value = ", ".join([f"{idx+1}. {p}" for idx, p in enumerate(priorities)])
        elif j == 22:  # Q23: Market saturation (rating 1–5)
            sat_map = {
                "Cloud Security": [3, 4, 4, 5],
                "Threat Detection": [3, 4, 4, 4],
                "IAM": [3, 3, 4, 4],
                "AppSec": [2, 3, 3, 4],
                "Data Privacy": [2, 3, 3, 3],
                "Endpoint Security": [4, 4, 5, 5],
                "Network Security": [3, 4, 4, 5],
                "IoT Security": [1, 2, 2, 3],
            }
            answer_value = str(random.choice(sat_map[domain]))
        elif j == 23:  # Q24: Number of competitors
            answer_value = random.choice(COMPETITOR_POOL)
        elif j == 24:  # Q25: Compliance standards (multiple_choice)
            selected = random.sample(COMPLIANCE_STD, k=random.randint(2, 4))
            answer_value = ", ".join(selected)
            answer_json = selected
        elif j == 25:  # Q26: Regulation impact
            answer_value = random.choice(REG_IMPACT_POOL)
        elif j == 26:  # Q27: International expansion (yes_no)
            intl_map = {
                "Idea / Pre-seed": ["no", "no", "yes"],
                "Seed Stage": ["no", "yes", "yes", "no"],
                "Series A": ["yes", "yes", "yes", "no"],
                "Series B": ["yes", "yes", "yes", "yes"],
                "Series C+": ["yes", "yes", "yes"],
                "Growth / Scale-up": ["yes", "yes", "yes"],
            }
            answer_value = random.choice(intl_map[stage])
        elif j == 27:  # Q28: Exit strategy
            answer_value = random.choice(EXIT_MAP[stage])
        elif j == 28:  # Q29: Long-term confidence (rating 1–5)
            answer_value = str(random.choices([3, 4, 4, 4, 5, 5, 5, 3, 4, 5], k=1)[0])
        elif j == 29:  # Q30: Founder advice (long_text)
            answer_value = FOUNDER_ADVICE[i % len(FOUNDER_ADVICE)]

        answer = SurveyAnswer(
            id=uuid.uuid4(),
            response_id=resp_id,
            question_id=q.id,
            answer_value=answer_value,
            answer_json=answer_json,
        )
        db.add(answer)

    if (i + 1) % 10 == 0:
        db.flush()
        print(f"  Submitted {i + 1}/55 responses...")

db.commit()
print(f"\n✅ Done! Survey '{survey.title}' created with {len(question_objects)} questions and 55 founder responses.")
print(f"   Survey ID : {str(survey_id)}")
print(f"   Linked to : {TARGET_EMAIL}")
print(f"   Tenant    : {tenant.name}")
print("   You can now view this survey and generate the Investor Readiness Report from the frontend.")
