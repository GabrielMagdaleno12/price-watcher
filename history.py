import json
from pathlib import Path


def load_history(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_history(path: Path, history: dict) -> None:
    path.write_text(json.dumps(history, indent=2, ensure_ascii=False), encoding="utf-8")


def append_snapshot(history: dict, snapshot: dict) -> dict:
    updated = {url: list(points) for url, points in history.items()}
    for url, point in snapshot.items():
        updated.setdefault(url, []).append(point)
    return updated
