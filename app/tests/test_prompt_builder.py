# ruff: noqa: RUF001
from __future__ import annotations

import socket
from pathlib import Path
from typing import Any

import pytest

from app.domain import (
    EventKind,
    EventPriority,
    FactionId,
    FactionState,
    FactionStatusKind,
    GameEvent,
    GamePhase,
    IntelAction,
    MessageVisibility,
    MilitaryAction,
    PrivateMessageAction,
    Relationship,
    RelationshipStatus,
    SpeechAction,
    TreatyAction,
    TreatyKind,
    VisibilityScope,
)
from app.game.settlement_aggregator import SettlementInput
from app.llm.prompt_builder import (
    OUTPUT_JSON_SCHEMA_HINT,
    PromptBuilder,
    SettlementPrompt,
    truncate,
)


@pytest.fixture()
def settlement_input() -> SettlementInput:
    visibility = MessageVisibility(scope=VisibilityScope.public, faction_ids=[])
    private_visibility = MessageVisibility(
        scope=VisibilityScope.faction_pair,
        faction_ids=[FactionId.ironCrown, FactionId.starlight],
    )
    self_visibility = MessageVisibility(
        scope=VisibilityScope.self,
        faction_ids=[FactionId.ironCrown],
    )

    speech_one = SpeechAction(
        **_base_action_payload("speech-1"),
        visibility=visibility,
        mode="speech",
        content="铁冠帝国宣布边境演习只是为了维护秩序。",
        targets=[FactionId.starlight],
    )
    speech_two = SpeechAction(
        **_base_action_payload("speech-2", actor_faction=FactionId.starlight),
        visibility=visibility,
        mode="speech",
        content="星辉联邦要求各方提交可验证证据。",
        targets=[FactionId.ironCrown, FactionId.aurora],
    )
    private = PrivateMessageAction(
        **_base_action_payload("private-1"),
        visibility=private_visibility,
        mode="private",
        content="秘密提议：共同牵制翡翠王庭，并交换边境情报。",
        target_faction=FactionId.starlight,
    )
    treaty = TreatyAction(
        **_base_action_payload("treaty-1"),
        visibility=private_visibility,
        mode="treaty",
        treaty_kind=TreatyKind.trade,
        target_factions=[FactionId.starlight],
        proposal_text="开放北境商路，三回合内互不征收战时关税。",
    )
    military = MilitaryAction(
        **_base_action_payload("military-1"),
        visibility=self_visibility,
        mode="military",
        source_region="region_iron_01",
        target_region="region_star_02",
        movement="attack",
        orders_text="第一军团佯攻河谷，主力绕行高地。",
        troops=120,
    )
    intel = IntelAction(
        **_base_action_payload("intel-1"),
        visibility=self_visibility,
        mode="intel",
        target_faction=FactionId.starlight,
        intel_kind="spy",
        brief="确认星辉联邦是否在河谷集结防御部队。",
    )

    return SettlementInput(
        room_id="room-1",
        epoch=2,
        turn=3,
        generated_at_ms=10_000,
        factions_snapshot=_factions(),
        relationships_snapshot=[
            Relationship(
                from_faction=FactionId.ironCrown,
                to_faction=FactionId.starlight,
                value=-15.0,
                status=RelationshipStatus.wary,
                treaties=[],
                last_changed_turn=2,
            )
        ],
        regions_snapshot=[],
        treaties_snapshot=[],
        turn_actions=[speech_one, speech_two, private, treaty, military, intel],
        public_speeches=[speech_one, speech_two],
        private_messages=[private],
        treaty_requests=[treaty],
        military_orders=[military],
        intel_actions=[intel],
        recent_events=[
            GameEvent(
                id="event-1",
                room_id="room-1",
                epoch=2,
                turn=2,
                phase=GamePhase.resolve,
                created_at_ms=9_000,
                priority=EventPriority.P1,
                kind=EventKind.narration,
                actor_faction=FactionId.ironCrown,
                target_faction=FactionId.starlight,
                payload={},
                narration="上一回合，铁冠帝国和星辉联邦在河谷发生外交摩擦。",
                visibility=visibility,
            )
        ],
        faction_personality_summary={
            faction_id: {
                "archetype": f"archetype-{faction_id.value}",
                "speech_style": "formal",
                "trigger_words": ["边境", "条约"],
                "aggression": 0.5,
                "trust_base": 0.4,
                "honor_code": 0.6,
            }
            for faction_id in FactionId
        },
        relationship_summary_text=(
            "ironCrown -> starlight: wary (-15.0), treaties=none, last_changed_turn=2"
        ),
        faction_stats_summary_text=_faction_stats_summary_text(),
    )


def test_build_settlement_prompt_contains_required_sections(
    settlement_input: SettlementInput,
) -> None:
    prompt = PromptBuilder().build_settlement_prompt(settlement_input)

    assert isinstance(prompt, SettlementPrompt)
    assert prompt.temperature == 0.6
    assert prompt.max_tokens == 4000
    assert "《外交风云》" in prompt.system
    assert "你只是建议方，后端规则会最终裁决" in prompt.system

    assert _faction_stats_summary_text() in prompt.user
    assert "秘密提议：共同牵制翡翠王庭" in prompt.user
    assert "铁冠帝国宣布边境演习" in prompt.user
    assert "开放北境商路" in prompt.user
    assert "region_iron_01 -> region_star_02" in prompt.user
    assert "确认星辉联邦是否在河谷集结" in prompt.user
    assert "上一回合，铁冠帝国和星辉联邦" in prompt.user

    for field_name in (
        "relationship_deltas",
        "ai_speeches",
        "treaty_decisions",
        "military_judgements",
        "culture_impacts",
        "morale_impacts",
        "narrative_events",
        "map_change_suggestions",
        "stat_change_suggestions",
    ):
        assert field_name in prompt.user
        assert field_name in prompt.json_schema_hint

    assert prompt.json_schema_hint == OUTPUT_JSON_SCHEMA_HINT


def test_truncate_limits_character_count() -> None:
    value = truncate("x" * 100, max_chars=20)

    assert len(value) == 20
    assert value.endswith("...")


def test_build_settlement_prompt_is_deterministic(settlement_input: SettlementInput) -> None:
    builder = PromptBuilder()

    first = builder.build_settlement_prompt(settlement_input)
    second = builder.build_settlement_prompt(settlement_input)

    assert first == second


def test_prompt_builder_does_not_open_network_socket(
    settlement_input: SettlementInput,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _blocked_socket(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("PromptBuilder must not open network sockets")

    monkeypatch.setattr(socket, "socket", _blocked_socket)

    PromptBuilder().build_settlement_prompt(settlement_input)


def test_prompt_builder_has_no_forbidden_project_imports() -> None:
    source = Path("app/llm/prompt_builder.py").read_text(encoding="utf-8")

    assert "app.api" not in source
    assert "app.protocol" not in source
    assert "app.repositories" not in source


def _base_action_payload(action_id: str, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "id": action_id,
        "room_id": "room-1",
        "epoch": 2,
        "turn": 3,
        "phase": GamePhase.action,
        "actor_player_id": "player-iron",
        "actor_faction": FactionId.ironCrown,
        "created_at_ms": 1_000,
    }
    payload.update(overrides)
    return payload


def _factions() -> list[FactionState]:
    return [
        FactionState(
            id=faction_id,
            military=100.0,
            economy=90.0,
            diplomacy=50.0,
            culture=40.0,
            morale=1.0,
            total_power=75.5,
            status=FactionStatusKind.stable,
            eliminated_at_turn=None,
        )
        for faction_id in FactionId
    ]


def _faction_stats_summary_text() -> str:
    lines = [
        "faction | military | economy | diplomacy | culture | morale | total_power | status",
        "--- | ---: | ---: | ---: | ---: | ---: | ---: | ---",
    ]
    lines.extend(
        f"{faction_id.value} | 100.0 | 90.0 | 50.0 | 40.0 | 1.00 | 75.5 | stable"
        for faction_id in FactionId
    )
    return "\n".join(lines)
