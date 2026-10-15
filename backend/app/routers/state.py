"""Управление глобальным состоянием бэкенда (пауза)."""

from fastapi import APIRouter
from pydantic import BaseModel

from ..services.app_state import app_state

router = APIRouter(prefix="/api/state", tags=["state"])


class PauseRequest(BaseModel):
    paused: bool


@router.get("")
async def get_state():
    return {"paused": app_state.is_paused}


@router.post("/pause")
async def set_pause(req: PauseRequest):
    app_state.is_paused = bool(req.paused)
    return {"paused": app_state.is_paused}
