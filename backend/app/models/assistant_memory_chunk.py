from sqlalchemy import Column, Integer, String, DateTime, Text, Index
from sqlalchemy.sql import func

from ..database import Base


class AssistantMemoryChunk(Base):
    """Чанки для RAG-памяти: фрагменты диалога и извлечённые факты + embedding (JSON)."""

    __tablename__ = "assistant_memory_chunks"
    __table_args__ = (Index("ix_mem_chunks_user_id_id", "user_id", "id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, default=1, index=True)
    kind = Column(String(16), nullable=False)  # turn | fact
    text = Column(Text, nullable=False)
    embedding_json = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
