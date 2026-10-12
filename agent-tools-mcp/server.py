"""Web UI: `uv run uvicorn server:app --reload`, then open http://localhost:8000"""

import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse

from agent import MODEL, DemoAgent

demo = DemoAgent()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await demo.setup()
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/")
def index():
    return FileResponse(Path(__file__).parent / "static" / "index.html")


@app.get("/api/info")
def info():
    return {"model": MODEL, "tools": demo.tool_info, "graph": demo.graph_mermaid()}


@app.get("/api/run")
async def run(q: str):
    async def sse():
        try:
            async for step in demo.run_steps(q):
                yield f"data: {json.dumps(step, default=str)}\n\n"
        except Exception as e:  # surface API/key errors in the UI instead of a dead stream
            yield f"data: {json.dumps({'type': 'error', 'text': f'{type(e).__name__}: {e}'})}\n\n"
        yield "data: {\"type\": \"done\"}\n\n"

    return StreamingResponse(sse(), media_type="text/event-stream")
