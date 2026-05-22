from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "diplomacy-backend"}


@router.get("/readyz")
async def readyz() -> dict[str, bool]:
    return {"ready": True}

