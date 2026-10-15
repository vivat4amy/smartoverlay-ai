# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for SmartOverlay AI backend
# Build:  cd backend && pyinstaller smartoverlay-backend.spec --clean --noconfirm

import sys
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None

# Collect all submodules that PyInstaller misses with static analysis
hidden = [
    # uvicorn internals
    "uvicorn",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.protocols.websockets.wsproto_impl",
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    # asyncio / aiosqlite
    "asyncio",
    "aiosqlite",
    # sqlalchemy async + sqlite dialect
    "sqlalchemy.dialects.sqlite",
    "sqlalchemy.ext.asyncio",
    "sqlalchemy.orm",
    # pydantic / pydantic-settings
    "pydantic",
    "pydantic_settings",
    # FastAPI + starlette internals
    "fastapi",
    "starlette",
    "starlette.routing",
    "starlette.middleware.cors",
    # multipart (python-multipart)
    "multipart",
    # websockets
    "websockets",
    "websockets.legacy",
    "websockets.legacy.server",
    # httpx / openai
    "httpx",
    "openai",
    # pytesseract / pillow
    "pytesseract",
    "PIL",
    "PIL.Image",
    # misc
    "email.mime.text",
    "email.mime.multipart",
    "dotenv",
    # audio recognition
    "sounddevice",
    "numpy",
    "numpy.core",
    "numpy.core._multiarray_umath",
    "shazamio",
    "shazamio_core",
    "aiohttp",
    "aiohttp.connector",
    "aiohttp.client",
    "aiohttp_retry",
    "aiofiles",
    "pydub",
    # cffi (used by sounddevice 0.5+)
    "_cffi_backend",
    "cffi",
]

# Dynamically sweep app package to avoid missing sub-modules
hidden += collect_submodules("app")

a = Analysis(
    ["run_prod.py"],
    pathex=["."],
    binaries=[],
    datas=[
        # Include i18n resources if any (add more as needed)
        # ("app/locales", "app/locales"),
    ],
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude heavy dev/test stuff that sneaks in
        "pytest",
        "IPython",
        "notebook",
        "matplotlib",
        "pandas",
        "scipy",
    ],
    noarchive=False,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="smartoverlay-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,           # UPX can cause false-positive AV alerts
    console=False,       # no console window — runs silently in background
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
