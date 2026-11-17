"""Ordinal scales for level-type goals."""
from __future__ import annotations

SCALES: dict[str, list[str]] = {
    "cefr": ["A1", "A2", "B1", "B2", "C1", "C2"],
    "proficiency": ["none", "beginner", "elementary", "intermediate", "advanced", "expert"],
}

LEVEL_LABELS_RU: dict[str, str] = {
    "none": "нет навыка",
    "beginner": "Beginner",
    "elementary": "Elementary",
    "intermediate": "Intermediate",
    "advanced": "Advanced",
    "expert": "Expert",
}


def normalize_level(scale: str | None, level: str | None) -> str | None:
    if level is None or scale not in SCALES:
        return level
    for item in SCALES[scale]:
        if item.lower() == level.strip().lower():
            return item
    return None


def level_index(scale: str | None, level: str | None) -> int | None:
    lvl = normalize_level(scale, level)
    if lvl is None or scale not in SCALES:
        return None
    return SCALES[scale].index(lvl)


def level_path(scale: str, start: int, end: int) -> list[str]:
    seq = SCALES[scale]
    return [f"{seq[i]} → {seq[i + 1]}" for i in range(start, end)]
