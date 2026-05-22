from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.api.rest.deps import (
    get_action_service,
    get_phase_service,
    get_replay_service,
    get_repositories,
    get_room_service,
    get_settlement_service,
)
from app.api.rest.dto import (
    ActionAckResponse,
    CreateRoomRequest,
    CreateRoomResponse,
    EventsResponse,
    ForcePhaseRequest,
    IntelActionRequest,
    JoinRoomRequest,
    JoinRoomResponse,
    LeaveRoomRequest,
    LeaveRoomResponse,
    LockRequest,
    MessagesResponse,
    MilitaryOrderRequest,
    PhaseResponse,
    PrivateMessageRequest,
    ReadyRequest,
    ReadyResponse,
    ReplayResponse,
    RoomStateResponse,
    RunSettlementRequest,
    SelectFactionRequest,
    SelectFactionResponse,
    SettlementResponse,
    SpeakRequest,
    StartRequest,
    StartResponse,
    TreatyRequest,
)
from app.domain.enums import FactionId
from app.repositories.factory import Repositories
from app.services.action_service import ActionService
from app.services.phase_service import PhaseService
from app.services.replay_service import ReplayService
from app.services.room_service import RoomService
from app.services.settlement_service import SettlementService

router = APIRouter(prefix="/debug/v1", tags=["debug"])


@router.post("/rooms", response_model=CreateRoomResponse)
async def create_room(
    request: CreateRoomRequest,
    room_service: Annotated[RoomService, Depends(get_room_service)],
) -> CreateRoomResponse:
    room, host = await room_service.create_room(
        mode=request.mode,
        host_display_name=request.host_display_name,
        seed=request.seed,
    )
    return CreateRoomResponse(room=_dump(room), host=_dump(host))


@router.post("/rooms/{room_id}/join", response_model=JoinRoomResponse)
async def join_room(
    room_id: str,
    request: JoinRoomRequest,
    room_service: Annotated[RoomService, Depends(get_room_service)],
) -> JoinRoomResponse:
    room, player = await room_service.join_room(room_id=room_id, display_name=request.display_name)
    return JoinRoomResponse(room=_dump(room), player=_dump(player))


@router.post("/rooms/{room_id}/leave", response_model=LeaveRoomResponse)
async def leave_room(
    room_id: str,
    request: LeaveRoomRequest,
    room_service: Annotated[RoomService, Depends(get_room_service)],
) -> LeaveRoomResponse:
    room = await room_service.leave_room(room_id=room_id, player_id=request.player_id)
    return LeaveRoomResponse(room=_dump(room))


@router.post("/rooms/{room_id}/select-faction", response_model=SelectFactionResponse)
async def select_faction(
    room_id: str,
    request: SelectFactionRequest,
    room_service: Annotated[RoomService, Depends(get_room_service)],
) -> SelectFactionResponse:
    room = await room_service.select_faction(
        room_id=room_id,
        player_id=request.player_id,
        faction_id=request.faction_id,
    )
    return SelectFactionResponse(room=_dump(room))


@router.post("/rooms/{room_id}/ready", response_model=ReadyResponse)
async def set_ready(
    room_id: str,
    request: ReadyRequest,
    room_service: Annotated[RoomService, Depends(get_room_service)],
) -> ReadyResponse:
    room = await room_service.set_ready(
        room_id=room_id,
        player_id=request.player_id,
        ready=request.ready,
    )
    return ReadyResponse(room=_dump(room))


@router.post("/rooms/{room_id}/start", response_model=StartResponse)
async def start_game(
    room_id: str,
    request: StartRequest,
    room_service: Annotated[RoomService, Depends(get_room_service)],
) -> StartResponse:
    room = await room_service.start_game(
        room_id=room_id,
        requester_player_id=request.player_id,
    )
    return StartResponse(room=_dump(room))


@router.get("/rooms/{room_id}", response_model=RoomStateResponse)
async def get_room_state(
    room_id: str,
    room_service: Annotated[RoomService, Depends(get_room_service)],
    repos: Annotated[Repositories, Depends(get_repositories)],
) -> RoomStateResponse:
    room = await room_service.get_room(room_id)
    current_turn = await repos.state.get_current_turn(room_id)
    return RoomStateResponse(
        room=_dump(room),
        factions=_dump_all(await repos.state.get_factions(room_id)),
        regions=_dump_all(await repos.state.get_regions(room_id)),
        relationships=_dump_all(await repos.state.get_relationships(room_id)),
        current_turn=_dump(current_turn or room.current),
    )


@router.post("/rooms/{room_id}/actions/speak", response_model=ActionAckResponse)
async def record_speech(
    room_id: str,
    request: SpeakRequest,
    action_service: Annotated[ActionService, Depends(get_action_service)],
) -> ActionAckResponse:
    ack = await action_service.record_speech(
        room_id=room_id,
        player_id=request.player_id,
        content=request.content,
        targets=request.targets,
        request_id=request.request_id,
    )
    return ActionAckResponse.model_validate(_dump(ack))


@router.post("/rooms/{room_id}/actions/private", response_model=ActionAckResponse)
async def record_private_message(
    room_id: str,
    request: PrivateMessageRequest,
    action_service: Annotated[ActionService, Depends(get_action_service)],
) -> ActionAckResponse:
    ack = await action_service.record_private_message(
        room_id=room_id,
        player_id=request.player_id,
        target_faction=request.target_faction,
        content=request.content,
        request_id=request.request_id,
    )
    return ActionAckResponse.model_validate(_dump(ack))


@router.post("/rooms/{room_id}/actions/treaty", response_model=ActionAckResponse)
async def record_treaty_request(
    room_id: str,
    request: TreatyRequest,
    action_service: Annotated[ActionService, Depends(get_action_service)],
) -> ActionAckResponse:
    ack = await action_service.record_treaty_request(
        room_id=room_id,
        player_id=request.player_id,
        treaty_kind=request.treaty_kind,
        target_factions=request.target_factions,
        proposal_text=request.proposal_text,
        request_id=request.request_id,
    )
    return ActionAckResponse.model_validate(_dump(ack))


@router.post("/rooms/{room_id}/actions/military", response_model=ActionAckResponse)
async def record_military_order(
    room_id: str,
    request: MilitaryOrderRequest,
    action_service: Annotated[ActionService, Depends(get_action_service)],
) -> ActionAckResponse:
    ack = await action_service.record_military_order(
        room_id=room_id,
        player_id=request.player_id,
        source_region=request.source_region,
        target_region=request.target_region,
        movement=request.movement,
        orders_text=request.orders_text,
        troops=request.troops,
        request_id=request.request_id,
    )
    return ActionAckResponse.model_validate(_dump(ack))


@router.post("/rooms/{room_id}/actions/intel", response_model=ActionAckResponse)
async def record_intel_action(
    room_id: str,
    request: IntelActionRequest,
    action_service: Annotated[ActionService, Depends(get_action_service)],
) -> ActionAckResponse:
    ack = await action_service.record_intel_action(
        room_id=room_id,
        player_id=request.player_id,
        target_faction=request.target_faction,
        intel_kind=request.intel_kind,
        brief=request.brief,
        request_id=request.request_id,
    )
    return ActionAckResponse.model_validate(_dump(ack))


@router.post("/rooms/{room_id}/actions/lock", response_model=ActionAckResponse)
async def record_lock_action(
    room_id: str,
    request: LockRequest,
    action_service: Annotated[ActionService, Depends(get_action_service)],
) -> ActionAckResponse:
    ack = await action_service.record_lock_action(
        room_id=room_id,
        player_id=request.player_id,
        request_id=request.request_id,
    )
    return ActionAckResponse.model_validate(_dump(ack))


@router.post("/rooms/{room_id}/phase/advance", response_model=PhaseResponse)
async def advance_phase(
    room_id: str,
    phase_service: Annotated[PhaseService, Depends(get_phase_service)],
) -> PhaseResponse:
    current_turn = await phase_service.advance_phase(room_id)
    return PhaseResponse(current_turn=_dump(current_turn))


@router.post("/rooms/{room_id}/phase/force", response_model=PhaseResponse)
async def force_phase(
    room_id: str,
    request: ForcePhaseRequest,
    phase_service: Annotated[PhaseService, Depends(get_phase_service)],
) -> PhaseResponse:
    current_turn = await phase_service.force_phase(
        room_id,
        phase=request.phase,
        arbitrate_phase=request.arbitrate_phase,
    )
    return PhaseResponse(current_turn=_dump(current_turn))


@router.post("/rooms/{room_id}/settlement/run", response_model=SettlementResponse)
async def run_settlement(
    room_id: str,
    request: RunSettlementRequest,
    settlement_service: Annotated[SettlementService, Depends(get_settlement_service)],
) -> dict[str, Any]:
    bundle = await settlement_service.run_turn_settlement(room_id, request.epoch, request.turn)
    return bundle.model_dump(mode="json")


@router.get("/rooms/{room_id}/events", response_model=EventsResponse)
async def list_events(
    room_id: str,
    room_service: Annotated[RoomService, Depends(get_room_service)],
    repos: Annotated[Repositories, Depends(get_repositories)],
    since_ms: Annotated[int, Query(ge=0)] = 0,
    faction_id: FactionId | None = None,
) -> list[dict[str, Any]]:
    await room_service.get_room(room_id)
    if faction_id is not None:
        events = await repos.events.list_visible_to_faction(room_id, faction_id, since_ms)
    else:
        events = [
            event
            for event in await repos.events.list_all(room_id)
            if event.created_at_ms >= since_ms
        ]
    return _dump_all(events)


@router.get("/rooms/{room_id}/messages", response_model=MessagesResponse)
async def list_messages(
    room_id: str,
    room_service: Annotated[RoomService, Depends(get_room_service)],
    repos: Annotated[Repositories, Depends(get_repositories)],
    epoch: int | None = None,
    turn: int | None = None,
) -> list[dict[str, Any]]:
    await room_service.get_room(room_id)
    if epoch is not None and turn is not None:
        messages = await repos.messages.list_by_turn(room_id, epoch, turn)
    else:
        messages = await repos.messages.list_by_room(room_id)
        if epoch is not None:
            messages = [message for message in messages if message.epoch == epoch]
        if turn is not None:
            messages = [message for message in messages if message.turn == turn]
    return _dump_all(messages)


@router.get("/rooms/{room_id}/replay", response_model=ReplayResponse)
async def get_replay(
    room_id: str,
    replay_service: Annotated[ReplayService, Depends(get_replay_service)],
) -> dict[str, Any]:
    replay = await replay_service.build_replay(room_id)
    return replay.model_dump(mode="json")


def _dump(model: Any) -> dict[str, Any]:
    return model.model_dump(mode="json")


def _dump_all(models: list[Any]) -> list[dict[str, Any]]:
    return [_dump(model) for model in models]
