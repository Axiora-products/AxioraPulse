
from pydantic import BaseModel

class DemoRequest(BaseModel):
    name: str
    email: str
    demo_date: str
    time_slot: str
