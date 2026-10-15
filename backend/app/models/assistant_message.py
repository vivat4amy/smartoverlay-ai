from sqlalchemy import Column, Integer, String, DateTime, Text, Index
from sqlalchemy.sql import func

from ..database import Base


class AssistantMessage(Base):
    """Сообщения диалога с локальным ассистентом (память между сессиями)."""

    __tablename__ = "assistant_messages"
    __table_args__ = (Index("ix_assistant_messages_user_id_id", "user_id", "id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, default=1, index=True)
    role = Column(String(16), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
