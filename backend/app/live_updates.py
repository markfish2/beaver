"""Single-process SSE invalidation feed for the shared personal workspace."""
import asyncio
import json

from fastapi import Depends, Request
from fastapi.responses import StreamingResponse

from .dependencies import get_current_user

subscribers: set[asyncio.Queue] = set()


def install_live_updates(app):
    @app.middleware("http")
    async def announce_write(request: Request, call_next):
        response = await call_next(request)
        path_parts = request.url.path.strip("/").split("/")
        resource = path_parts[1:2]
        if resource == ["documents"] and "highlights" in path_parts:
            resource = ["highlights"]
        # The share endpoint persists the submitted page as a Memo. Older
        # browser integrations use this endpoint instead of /memos/ directly.
        if resource == ["share"]:
            resource = ["memos"]
        if (request.method in {"POST", "PUT", "PATCH", "DELETE"}
                and 200 <= response.status_code < 300
                and resource and resource[0] in {"documents", "nodes", "memos", "diary", "trash", "highlights"}):
            message = {"resource": resource[0], "source": request.headers.get("X-Client-ID", "")}
            for queue in tuple(subscribers):
                if queue.full():
                    while not queue.empty():
                        queue.get_nowait()
                    queue.put_nowait({"resource": "all", "source": ""})
                else:
                    queue.put_nowait(message)
        return response

    @app.get("/api/live", dependencies=[Depends(get_current_user)])
    async def live():
        queue = asyncio.Queue(maxsize=128)
        subscribers.add(queue)

        async def stream():
            try:
                # Every connection reconciles changes missed while disconnected.
                yield 'data: {"resource":"all","source":""}\n\n'
                while True:
                    try:
                        message = await asyncio.wait_for(queue.get(), timeout=25)
                        yield "data: " + json.dumps(message) + "\n\n"
                    except asyncio.TimeoutError:
                        yield ": heartbeat\n\n"
            finally:
                subscribers.discard(queue)

        return StreamingResponse(stream(), media_type="text/event-stream", headers={
            "Cache-Control": "no-cache", "X-Accel-Buffering": "no",
        })
