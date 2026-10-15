from sqlalchemy import Column, Integer, String, Float, DateTime, Text, JSON
from sqlalchemy.sql import func
from ..database import Base


class Recognition(Base):
    __tablename__ = "recognitions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, index=True)
    category = Column(String, index=True)
    title = Column(String)
    confidence = Column(Float)
    detected_objects = Column(JSON, default=list)
    text_content = Column(Text)
    extra_data = Column(JSON, default=dict)
    tips = Column(JSON, default=list)
    created_at = Column(DateTime, server_default=func.now())
