from pydantic import BaseModel, Field, model_validator


class AssistantMsgIn(BaseModel):
    role: str
    content: str


class LocalAssistantChatRequest(BaseModel):
    """Либо `content` (новая реплика + история из БД), либо полный `messages` (без долгой памяти)."""

    messages: list[AssistantMsgIn] = Field(default_factory=list)
    content: str | None = Field(
        default=None,
        description="Одна новая реплика пользователя; история подтягивается с сервера.",
    )
    context_title: str | None = None
    context_category: str | None = None
    context_screen_text: str | None = None
    image_base64: str | None = Field(
        default=None,
        description="Base64 кадра экрана (без data:); тогда используется vision-модель.",
    )
    persist: bool = Field(
        default=True,
        description="Сохранять этот обмен в долговременную память (SQLite).",
    )

    @model_validator(mode="after")
    def content_or_messages(self) -> "LocalAssistantChatRequest":
        if (self.content or "").strip():
            return self
        if self.messages:
            return self
        raise ValueError("Нужен непустой content или messages")


class LocalAssistantChatResponse(BaseModel):
    reply: str
    model: str


class AssistantHistoryMsg(BaseModel):
    role: str
    content: str


class AssistantTranscribeResponse(BaseModel):
    text: str
