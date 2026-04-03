from typing import Optional, List
from sqlmodel import SQLModel, Field, JSON, Column, TEXT
from datetime import datetime

class Transcript(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    video_id: str = Field(index=True, unique=True)
    language: str
    plain_text: str = Field(sa_column=Column(TEXT))
    segments: List[dict] = Field(default=[], sa_type=JSON)
    created_at: datetime = Field(default_factory=datetime.utcnow)
