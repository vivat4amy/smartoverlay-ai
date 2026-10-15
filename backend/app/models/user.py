from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from ..database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, default="Default User")
    language = Column(String, default="ru")
    overlay_opacity = Column(Float, default=0.95)
    capture_interval_sec = Column(Integer, default=4)
    vision_provider = Column(String, default="gpt4o")
    openai_api_key = Column(String, default="")
    openai_model = Column(String, default="gpt-4o")
    panel_width = Column(Integer, default=380)
    panel_height = Column(Integer, default=560)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
