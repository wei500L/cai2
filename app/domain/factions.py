from enum import StrEnum


class FactionId(StrEnum):
    ironCrown = "ironCrown"
    starlight = "starlight"
    emerald = "emerald"
    ashen = "ashen"
    voidChurch = "voidChurch"
    aurora = "aurora"
    magma = "magma"
    darkTide = "darkTide"


FACTION_IDS: tuple[FactionId, ...] = (
    FactionId.ironCrown,
    FactionId.starlight,
    FactionId.emerald,
    FactionId.ashen,
    FactionId.voidChurch,
    FactionId.aurora,
    FactionId.magma,
    FactionId.darkTide,
)

FACTION_LABELS: dict[FactionId, str] = {
    FactionId.ironCrown: "铁冠帝国",
    FactionId.starlight: "星辉联邦",
    FactionId.emerald: "翡翠王庭",
    FactionId.ashen: "灰烬部族",
    FactionId.voidChurch: "虚空教廷",
    FactionId.aurora: "极光共和",
    FactionId.magma: "熔岩议会",
    FactionId.darkTide: "暗潮商会",
}

