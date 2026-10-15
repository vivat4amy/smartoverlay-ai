"""FastAPI entrypoint. UTF-8 stdio first — Windows cp125x consoles break on Cyrillic logs."""
import sys

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .config import config
from .database import init_db
from .websocket import ws_manager
from .routers import vision, search, recommendations, interests, user, history, music, state, assistant
from .services.music_listener import music_listener


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    if config.music_listener_enabled:
        await music_listener.start()
    try:
        yield
    finally:
        await music_listener.stop()


app = FastAPI(
    title="SmartOverlay AI Backend",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(vision.router)
app.include_router(search.router)
app.include_router(recommendations.router)
app.include_router(interests.router)
app.include_router(user.router)
app.include_router(history.router)
app.include_router(music.router)
app.include_router(state.router)
app.include_router(assistant.router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0", "vision_provider": config.vision_provider}


@app.websocket("/ws/overlay")
async def websocket_overlay(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming messages from overlay (e.g., manual trigger)
            if data == "ping":
                await websocket.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
