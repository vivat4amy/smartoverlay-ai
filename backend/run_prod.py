"""
Production entry point for PyInstaller bundle.

When frozen:
  - cwd → %APPDATA%\\SmartOverlay AI   (persistent data: DB, .env)
  - .env is copied from the exe directory on first launch so the user
    can place their keys next to the installed exe.
  - reload is disabled (not supported inside a frozen binary).

When running normally (dev):
  - behaves the same as run.py but without --reload.
"""

import os
import sys

# ── path bootstrap ────────────────────────────────────────────────────────────
if getattr(sys, "frozen", False):
    # Running as a PyInstaller one-file bundle.
    exe_dir = os.path.dirname(sys.executable)
    app_data_root = os.environ.get("APPDATA", os.path.expanduser("~"))
    work_dir = os.path.join(app_data_root, "SmartOverlay AI")

    os.makedirs(work_dir, exist_ok=True)
    os.makedirs(os.path.join(work_dir, "data"), exist_ok=True)

    # Copy .env from the exe directory if it exists and hasn't been copied yet.
    env_src = os.path.join(exe_dir, ".env")
    env_dst = os.path.join(work_dir, ".env")
    if os.path.exists(env_src) and not os.path.exists(env_dst):
        import shutil
        shutil.copy(env_src, env_dst)

    # All relative paths (DB, .env) will now resolve inside work_dir.
    os.chdir(work_dir)

# ── reconfigure stdio for Windows UTF-8 ──────────────────────────────────────
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

# ── start server ──────────────────────────────────────────────────────────────
import uvicorn
from app.main import app as fastapi_app  # noqa: E402  (import after chdir)
from app.config import config             # noqa: E402

if __name__ == "__main__":
    uvicorn.run(
        fastapi_app,
        host=config.host,
        port=config.port,
        reload=False,
        log_level="warning",
    )
