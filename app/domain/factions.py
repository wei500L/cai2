from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import FactionId

PERSONALITY_KEYS: frozenset[str] = frozenset(
    {
        "aggression",
        "trust_base",
        "memory_depth",
        "deception",
        "alliance_tendency",
        "emotional_volatility",
        "honor_code",
    }
)


class FactionMeta(BaseModel):
    model_config = ConfigDict(strict=True, frozen=False, validate_assignment=True)

    id: FactionId
    name: str
    primary_color: str
    glow_color: str
    shadow_color: str
    civilization: str
    archetype: str
    advantage: str
    speech_style: str
    trigger_words: list[str] = Field(default_factory=list)
    personality: dict[str, float]


FACTION_META: dict[FactionId, FactionMeta] = {
    FactionId.ironCrown: FactionMeta(
        id=FactionId.ironCrown,
        name="铁冠帝国",
        primary_color="#8B1A1A",
        glow_color="#FF3333",
        shadow_color="#2D0A0A",
        civilization="军事工业化，等级森严",
        archetype="铁血征服者",
        advantage="军事力+20%",
        speech_style="commanding_imperial",
        trigger_words=["臣服", "投降", "弱者"],
        personality={
            "aggression": 0.9,
            "trust_base": 0.2,
            "memory_depth": 3.0,
            "deception": 0.3,
            "alliance_tendency": 0.2,
            "emotional_volatility": 0.4,
            "honor_code": 0.6,
        },
    ),
    FactionId.starlight: FactionMeta(
        id=FactionId.starlight,
        name="星辉联邦",
        primary_color="#1A5F8B",
        glow_color="#33AAFF",
        shadow_color="#0A1A2D",
        civilization="科技民主，重视规则",
        archetype="理性合作者",
        advantage="科技系数+1",
        speech_style="analytical_diplomatic",
        trigger_words=["数据", "逻辑", "证据"],
        personality={
            "aggression": 0.3,
            "trust_base": 0.6,
            "memory_depth": 999.0,
            "deception": 0.1,
            "alliance_tendency": 0.8,
            "emotional_volatility": 0.2,
            "honor_code": 0.9,
        },
    ),
    FactionId.emerald: FactionMeta(
        id=FactionId.emerald,
        name="翡翠王庭",
        primary_color="#1A8B3D",
        glow_color="#33FF77",
        shadow_color="#0A2D15",
        civilization="商贸帝国，富可敌国",
        archetype="狡猾商人",
        advantage="贸易收益+30%",
        speech_style="charming_mercantile",
        trigger_words=["利润", "交易", "合作"],
        personality={
            "aggression": 0.4,
            "trust_base": 0.4,
            "memory_depth": 10.0,
            "deception": 0.8,
            "alliance_tendency": 0.7,
            "emotional_volatility": 0.3,
            "honor_code": 0.3,
        },
    ),
    FactionId.ashen: FactionMeta(
        id=FactionId.ashen,
        name="灰烬部族",
        primary_color="#8B5A1A",
        glow_color="#FF9933",
        shadow_color="#2D1E0A",
        civilization="游牧战士，崇尚荣誉",
        archetype="热血战士",
        advantage="士气上限+0.3",
        speech_style="passionate_warrior",
        trigger_words=["懦夫", "荣誉", "勇气", "战斗"],
        personality={
            "aggression": 0.8,
            "trust_base": 0.7,
            "memory_depth": 2.0,
            "deception": 0.05,
            "alliance_tendency": 0.5,
            "emotional_volatility": 0.9,
            "honor_code": 0.95,
        },
    ),
    FactionId.voidChurch: FactionMeta(
        id=FactionId.voidChurch,
        name="虚空教廷",
        primary_color="#5A1A8B",
        glow_color="#9933FF",
        shadow_color="#1E0A2D",
        civilization="宗教文明，精神控制",
        archetype="神秘操控者",
        advantage="文化影响+40%",
        speech_style="mystical_prophetic",
        trigger_words=["命运", "预言", "信仰"],
        personality={
            "aggression": 0.5,
            "trust_base": 0.3,
            "memory_depth": 999.0,
            "deception": 0.7,
            "alliance_tendency": 0.6,
            "emotional_volatility": 0.1,
            "honor_code": 0.4,
        },
    ),
    FactionId.aurora: FactionMeta(
        id=FactionId.aurora,
        name="极光共和",
        primary_color="#1A8B8B",
        glow_color="#33FFFF",
        shadow_color="#0A2D2D",
        civilization="科研至上，和平主义",
        archetype="技术中立者",
        advantage="防御加成+25%",
        speech_style="academic_neutral",
        trigger_words=["研究", "和平", "知识"],
        personality={
            "aggression": 0.1,
            "trust_base": 0.5,
            "memory_depth": 20.0,
            "deception": 0.2,
            "alliance_tendency": 0.9,
            "emotional_volatility": 0.3,
            "honor_code": 0.8,
        },
    ),
    FactionId.magma: FactionMeta(
        id=FactionId.magma,
        name="熔岩议会",
        primary_color="#8B3A1A",
        glow_color="#FF6633",
        shadow_color="#2D120A",
        civilization="地底文明，资源丰富",
        archetype="防御守财奴",
        advantage="资源产出+25%",
        speech_style="gruff_pragmatic",
        trigger_words=["资源", "矿脉", "领土"],
        personality={
            "aggression": 0.3,
            "trust_base": 0.4,
            "memory_depth": 8.0,
            "deception": 0.4,
            "alliance_tendency": 0.3,
            "emotional_volatility": 0.5,
            "honor_code": 0.7,
        },
    ),
    FactionId.darkTide: FactionMeta(
        id=FactionId.darkTide,
        name="暗潮商会",
        primary_color="#6B5A1A",
        glow_color="#CCAA33",
        shadow_color="#231E0A",
        civilization="情报网络，无处不在",
        archetype="情报贩子",
        advantage="情报获取免费",
        speech_style="smooth_conspiratorial",
        trigger_words=["秘密", "情报", "交换"],
        personality={
            "aggression": 0.4,
            "trust_base": 0.2,
            "memory_depth": 999.0,
            "deception": 0.9,
            "alliance_tendency": 0.8,
            "emotional_volatility": 0.2,
            "honor_code": 0.1,
        },
    ),
}


FACTION_IDS: tuple[FactionId, ...] = tuple(FACTION_META.keys())
FACTION_LABELS: dict[FactionId, str] = {
    faction_id: meta.name for faction_id, meta in FACTION_META.items()
}


def get_faction_meta(fid: FactionId) -> FactionMeta:
    return FACTION_META[fid]


def all_faction_ids() -> tuple[FactionId, ...]:
    return FACTION_IDS
