#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("ENV", "development")
os.environ["LLM_PROVIDER"] = "mock"
os.environ["LIGHTING_DYNAMIC"] = "true"


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed a deterministic globe smoke room.")
    parser.add_argument("--turns", type=int, default=5)
    parser.add_argument("--seed", type=int, default=424242)
    parser.add_argument("--serve", action="store_true", help="start uvicorn instead of seeding")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    if args.serve:
        import uvicorn

        uvicorn.run("app.main:app", host=args.host, port=args.port, reload=False)
        return

    result = asyncio.run(_run(turns=args.turns, seed=args.seed))
    print(json.dumps(result, ensure_ascii=False, indent=2))


async def _run(*, turns: int, seed: int) -> dict[str, object]:
    from app.api.websocket.connection import ConnectionManager
    from app.api.websocket.dispatcher import OutboundDispatcher
    from app.core.clock import SystemClock
    from app.repositories.factory import make_repositories
    from app.services.dev_seed_globe import run_dev_seed_globe

    repos = make_repositories("memory")
    clock = SystemClock()
    connection_manager = ConnectionManager()
    dispatcher = OutboundDispatcher(connection_manager, repos, clock)
    result = await run_dev_seed_globe(
        repos=repos,
        clock=clock,
        dispatcher=dispatcher,
        connection_manager=connection_manager,
        turns=turns,
        seed=seed,
        lighting_dynamic=True,
    )
    return result.model_dump()


if __name__ == "__main__":
    main()
