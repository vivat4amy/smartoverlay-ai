from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from ..database import Base


class CaptureSession(Base):
    __tablename__ = "capture_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    window_title = Column(String)
    process_name = Column(String)
    ocr_text = Column(Text)
    image_hash = Column(String, index=True)
    created_at = Column(DateTime, server_default=func.now())
