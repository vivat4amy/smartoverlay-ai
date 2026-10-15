"""Глобальное состояние приложения для всех фоновых сервисов."""

from dataclasses import dataclass


@dataclass
class AppState:
    is_paused: bool = False


app_state = AppState()
