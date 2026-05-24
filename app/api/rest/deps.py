from __future__ import annotations

from collections.abc import Awaitable, Callable
from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.api.websocket.connection import ConnectionManager
from app.api.websocket.dispatcher import OutboundDispatcher
from app.core.clock import Clock, SystemClock
from app.core.config import get_settings
from app.game.rule_resolver import RuleResolver
from app.game.settlement_aggregator import SettlementAggregator
from app.llm.factory import make_llm_client
from app.llm.output_parser import ModelOutputParser
from app.llm.prompt_builder import PromptBuilder
from app.repositories.factory import Repositories, make_repositories
from app.services.action_service import ActionService
from app.services.factions_meta_service import FactionsMetaService
from app.services.opening_service import OpeningService
from app.services.phase_scheduler import PhaseScheduler
from app.services.phase_service import PhaseService
from app.services.replay_service import ReplayService
from app.services.room_service import RoomService
from app.services.settlement_service import SettlementService
from app.services.takeover_service import TakeoverService


@lru_cache(maxsize=1)
def get_repositories() -> Repositories:
    return make_repositories("memory")


@lru_cache(maxsize=1)
def get_clock() -> Clock:
    return SystemClock()


@lru_cache(maxsize=1)
def get_connection_manager() -> ConnectionManager:
    return ConnectionManager()


@lru_cache(maxsize=1)
def get_outbound_dispatcher() -> OutboundDispatcher:
    return OutboundDispatcher(
        get_connection_manager(),
        get_repositories(),
        get_clock(),
        get_factions_meta_service(get_repositories()),
    )


def get_factions_meta_service(
    repos: Annotated[Repositories, Depends(get_repositories)],
) -> FactionsMetaService:
    return FactionsMetaService(repos)


@lru_cache(maxsize=1)
def get_takeover_service() -> TakeoverService:
    return TakeoverService(get_repositories(), get_clock(), get_outbound_dispatcher())


def get_action_service(
    repos: Annotated[Repositories, Depends(get_repositories)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> ActionService:
    return ActionService(repos, clock)


def get_phase_service(
    repos: Annotated[Repositories, Depends(get_repositories)],
    clock: Annotated[Clock, Depends(get_clock)],
    dispatcher: Annotated[OutboundDispatcher, Depends(get_outbound_dispatcher)],
) -> PhaseService:
    return PhaseService(
        repos,
        clock,
        on_room_finished=_build_room_finished_callback(repos, clock, dispatcher),
    )


def _build_room_finished_callback(
    repos: Repositories,
    clock: Clock,
    dispatcher: OutboundDispatcher,
) -> Callable[[str], Awaitable[None]]:
    replay_service = ReplayService(repos, clock)

    async def on_room_finished(room_id: str) -> None:
        replay = await replay_service.build_replay(room_id)
        await dispatcher.dispatch_room_finished(
            room_id,
            winner=replay.winner,
            final_narration=replay.final_narration,
            replay_available=True,
        )
        await dispatcher.dispatch_diary_reveal(room_id)

    return on_room_finished


def get_settlement_service(
    repos: Annotated[Repositories, Depends(get_repositories)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> SettlementService:
    if repos is get_repositories() and clock is get_clock():
        return _get_cached_settlement_service()
    return _build_settlement_service(repos, clock)


@lru_cache(maxsize=1)
def _get_cached_settlement_service() -> SettlementService:
    return _build_settlement_service(get_repositories(), get_clock())


def _build_settlement_service(repos: Repositories, clock: Clock) -> SettlementService:
    settings = get_settings()
    return SettlementService(
        repos=repos,
        clock=clock,
        aggregator=SettlementAggregator(repos, clock),
        prompt_builder=PromptBuilder(),
        llm_client=make_llm_client(settings.llm_provider, settings=settings),
        parser=ModelOutputParser(),
        rule_resolver=RuleResolver(deterministic_rng_seed=0),
    )


@lru_cache(maxsize=1)
def get_phase_scheduler() -> PhaseScheduler:
    repos = get_repositories()
    clock = get_clock()
    dispatcher = get_outbound_dispatcher()
    settings = get_settings()
    llm_client = make_llm_client(settings.llm_provider, settings=settings)
    return PhaseScheduler(
        phase_service=PhaseService(
            repos,
            clock,
            on_room_finished=_build_room_finished_callback(repos, clock, dispatcher),
        ),
        settlement_service=get_settlement_service(repos, clock),
        opening_service=OpeningService(llm_client=llm_client, clock=clock),
        repos=repos,
        clock=clock,
        dispatcher=dispatcher,
    )


def get_room_service(
    repos: Annotated[Repositories, Depends(get_repositories)],
    clock: Annotated[Clock, Depends(get_clock)],
    phase_scheduler: Annotated[PhaseScheduler, Depends(get_phase_scheduler)],
) -> RoomService:
    return RoomService(
        repos,
        clock,
        on_room_started=phase_scheduler.start_room,
        on_room_stopped=phase_scheduler.stop_room,
    )


def get_replay_service(
    repos: Annotated[Repositories, Depends(get_repositories)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> ReplayService:
    return ReplayService(repos, clock)
