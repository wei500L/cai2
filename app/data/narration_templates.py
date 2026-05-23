"""Narration template pool."""
# ruff: noqa: RUF001

from __future__ import annotations

from collections.abc import Sequence
from hashlib import sha256

EPIC_NARRATION_TEMPLATES: list[str] = [
    "纪元 {epoch} 的余烬在 {faction_name} 的边界上缓慢升温，旧有的默契被战鼓一点点敲松。",
    "{faction_name} 在纪元 {epoch} 里并未独占舞台，却始终站在权力重新分配的转折口。",
    "当纪元 {epoch} 逼近终点，{faction_name} 目睹盟约、试探与反制同时压向同一条战线。",
    "纪元 {epoch} 的风向变得锋利，{faction_name} 在喧哗与沉默之间重新丈量敌友。",
    "旧秩序在纪元 {epoch} 并未碎裂成粉末，而是被 {faction_name} 与诸方博弈磨出裂缝。",
    "纪元 {epoch} 的最后时刻，{faction_name} 的选择像钉子一样钉住了新的局势走向。",
    "战火、背约与公开宣言在纪元 {epoch} 交错，{faction_name} 被迫在多条战线上同时回应。",
    "{faction_name} 让纪元 {epoch} 的结尾更像一次缓慢燃烧的审判，而非轻巧的收束。",
    "纪元 {epoch} 结束时，{faction_name} 身后堆起的是胜利的碎片，也是下一轮冲突的引信。",
    "当纪元 {epoch} 收官，{faction_name} 没有完全赢下棋局，却足以让所有对手重新计算代价。",
]

SUMMARY_HEADLINE_TEMPLATES: list[str] = [
    "纪元 {epoch}：{faction_name} 把节奏重新握回手中",
    "纪元 {epoch}：{faction_name} 在乱局里压出新排序",
    "纪元 {epoch}：{faction_name} 让局势重新定价",
    "纪元 {epoch}：{faction_name} 站上新的权力刻度",
    "纪元 {epoch}：{faction_name} 把风暴推回对手身上",
    "纪元 {epoch}：{faction_name} 让旧盟约重新接受检验",
    "纪元 {epoch}：{faction_name} 为下一阶段铺出硬边界",
    "纪元 {epoch}：{faction_name} 把混乱压成可计算的局面",
    "纪元 {epoch}：{faction_name} 让各方都不敢轻易下注",
    "纪元 {epoch}：{faction_name} 在终局前抢下先手",
]

SUMMARY_HIGHLIGHT_TEMPLATES: list[str] = [
    "边境战争把各方的战略成本抬高了一整层。",
    "公开演讲改变了盟友与对手对局势的判断。",
    "背叛事件打破了原本看似稳固的承诺。",
    "条约和贸易在压力下被重新估值。",
    "战争与宣言同时出现，让局势更难回到旧轨道。",
    "演讲把潜伏的疑虑推到了台前。",
    "背约让一些势力开始重新部署兵力。",
    "军事碰撞之后，边境线的紧张感显著上升。",
    "公开表态让下一轮交锋提前露出轮廓。",
    "战争、演讲与试探共同重写了纪元收束的叙事。",
]


def pick_template(templates: Sequence[str], *, seed: str) -> str:
    if not templates:
        raise ValueError("templates must not be empty")
    digest = sha256(seed.encode("utf-8")).hexdigest()
    index = int(digest[:8], 16) % len(templates)
    return templates[index]


def pick_templates(templates: Sequence[str], *, seed: str, count: int) -> list[str]:
    if count <= 0:
        return []
    if not templates:
        raise ValueError("templates must not be empty")

    start = int(sha256(seed.encode("utf-8")).hexdigest()[8:16], 16)
    ordered = list(range(len(templates)))
    ordered.sort(
        key=lambda index: int(sha256(f"{seed}:{index}".encode()).hexdigest()[:8], 16)
    )
    selected = [templates[ordered[(start + offset) % len(templates)]] for offset in range(count)]
    return selected
