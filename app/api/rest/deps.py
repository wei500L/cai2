from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.core.clock import Clock, SystemClock
from app.game.rule_resolver import RuleResolver
from app.game.settlement_aggregator import SettlementAggregator
from app.llm.mock_client import MockLLMClient
from app.llm.output_parser import ModelOutputParser
from app.llm.prompt_builder import PromptBuilder
from app.repositories.factory import Repositories, make_repositories
from app.services.action_service import ActionService
from app.services.phase_service import PhaseService
from app.services.replay_service import ReplayService
from app.services.room_service import RoomService
from app.services.settlement_service import SettlementService


@lru_cache(maxsize=1)
def get_repositories() -> Repositories:
    return make_repositories("memory")


@lru_cache(maxsize=1)
def get_clock() -> Clock:
    return SystemClock()


def get_room_service(
    repos: Annotated[Repositories, Depends(get_repositories)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> RoomService:
    return RoomService(repos, clock)


def get_action_service(
    repos: Annotated[Repositories, Depends(get_repositories)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> ActionService:
    return ActionService(repos, clock)


def get_phase_service(
    repos: Annotated[Repositories, Depends(get_repositories)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> PhaseService:
    return PhaseService(repos, clock)


def get_settlement_service(
    repos: Annotated[Repositories, Depends(get_repositories)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> SettlementService:
    return SettlementService(
        repos=repos,
        clock=clock,
        aggregator=SettlementAggregator(repos, clock),
        prompt_builder=PromptBuilder(),
        llm_client=MockLLMClient(),
        parser=ModelOutputParser(),
        rule_resolver=RuleResolver(deterministic_rng_seed=0),
    )


def get_replay_service(
    repos: Annotated[Repositories, Depends(get_repositories)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> ReplayService:
    return ReplayService(repos, clock)
