"""FastAPI app — /api/status, /api/health, /api/atlas/*, and SPA static file serving."""

import json
import os
import platform
import re
import socket
import urllib.request
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from server.bot_state import state

app = FastAPI(title="Company Brain API", docs_url=None, redoc_url=None)

# CORS — allow the frontend (and localhost dev) to call the API
_cors_origins = [
    "http://localhost:5173",
    "http://localhost:8080",
]
_extra = os.getenv("CORS_ORIGINS", "")
if _extra:
    _cors_origins.extend(o.strip() for o in _extra.split(",") if o.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WEB_DIST = Path(__file__).parent.parent / "web" / "dist"

# Atlas data directory
ATLAS_DATA_DIR = Path(
    os.getenv("ATLAS_DATA_DIR",
              str(Path(__file__).parent.parent / "data" / "reports" / "data"))
)

# Validate atlas resource names (alphanumeric + hyphens only)
_ATLAS_NAME_RE = re.compile(r'^[a-zA-Z0-9-]+$')


def _detect_deployment() -> dict:
    """Auto-detect the deployment environment."""
    env_type = "local"
    detail = platform.node() or "unknown"

    if os.environ.get("ECS_CONTAINER_METADATA_URI") or os.environ.get("ECS_CONTAINER_METADATA_URI_V4"):
        env_type = "aws-ecs"
        cluster = os.environ.get("ECS_CLUSTER", "")
        task_id = os.environ.get("ECS_TASK_ARN", "").rsplit("/", 1)[-1][:12] if os.environ.get("ECS_TASK_ARN") else ""
        detail = f"{cluster}/{task_id}" if cluster else "ECS"
    elif os.environ.get("AWS_EXECUTION_ENV") or (
        os.path.exists("/sys/hypervisor/uuid") and open("/sys/hypervisor/uuid").read(3) == "ec2"
    ):
        env_type = "aws-ec2"
        detail = platform.node()
    elif os.path.exists("/.dockerenv") or os.path.exists("/run/.containerenv"):
        env_type = "docker"
        detail = platform.node()
    elif os.environ.get("INVOCATION_ID"):
        env_type = "systemd"
        detail = platform.node()

    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or ""

    return {
        "type": env_type,
        "hostname": platform.node(),
        "private_ip": _get_local_ip(),
        "public_ip": _get_public_ip(),
        "region": region,
        "detail": detail,
        "python": platform.python_version(),
        "os": f"{platform.system()} {platform.release()}",
    }


def _get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def _get_public_ip() -> str:
    try:
        resp = urllib.request.urlopen("https://checkip.amazonaws.com", timeout=3)
        return resp.read().decode().strip()
    except Exception:
        return ""


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/status")
async def status():
    uptime_seconds = None
    if state.started_at:
        uptime_seconds = (datetime.now() - state.started_at).total_seconds()

    return {
        "bot_name": state.bot_name,
        "started_at": state.started_at.isoformat() if state.started_at else None,
        "uptime_seconds": uptime_seconds,
        "last_activity": state.last_activity.isoformat() if state.last_activity else None,
        "modules": {
            "transcription": {"enabled": True, "provider": "AssemblyAI"},
            "storage": {
                "enabled": True,
                "local": True,
                "s3": state.s3_enabled,
                "s3_bucket": state.s3_bucket,
            },
        },
        "counters": {
            "transcriptions": state.transcription_count,
            "files": state.file_count,
        },
        "recent_errors": state.recent_errors,
        "deployment": _detect_deployment(),
    }


# ── Atlas Data API ─────────────────────────────────────────────

@app.get("/api/atlas/dimensions")
async def atlas_dimensions():
    """Serve dimensions.json from ATLAS_DATA_DIR."""
    dims_file = ATLAS_DATA_DIR / "dimensions.json"
    if not dims_file.exists():
        raise HTTPException(status_code=404, detail="dimensions.json not found")
    return JSONResponse(json.loads(dims_file.read_text()))


@app.get("/api/atlas/data/{name}")
async def atlas_get_data(name: str):
    """Serve {name}.json from ATLAS_DATA_DIR."""
    if not _ATLAS_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid resource name")
    data_file = ATLAS_DATA_DIR / f"{name}.json"
    if not data_file.exists():
        raise HTTPException(status_code=404, detail=f"{name}.json not found")
    return JSONResponse(json.loads(data_file.read_text()))


@app.put("/api/atlas/data/{name}")
async def atlas_put_data(name: str, request: Request):
    """Write JSON body to {name}.json in ATLAS_DATA_DIR."""
    if not _ATLAS_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid resource name")
    body = await request.json()
    if not isinstance(body, dict) or not body.get("user_id"):
        raise HTTPException(status_code=400, detail="user_id is required")
    ATLAS_DATA_DIR.mkdir(parents=True, exist_ok=True)
    data_file = ATLAS_DATA_DIR / f"{name}.json"
    data_file.write_text(json.dumps(body, ensure_ascii=False, indent=2))
    return {"status": "saved", "file": f"{name}.json"}


# ── Static file serving ───────────────────────────────────────

if WEB_DIST.exists() and (WEB_DIST / "index.html").exists():
    assets_dir = WEB_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        # Try to serve the exact file first
        file_path = WEB_DIST / path
        if path and file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        # Otherwise serve index.html (SPA routing)
        return FileResponse(str(WEB_DIST / "index.html"))
