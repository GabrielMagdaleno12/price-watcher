import json
from state import load_state, save_state


def test_load_state_missing_file_returns_empty_dict(tmp_path):
    result = load_state(tmp_path / "state.json")
    assert result == {}


def test_load_state_reads_existing_json(tmp_path):
    path = tmp_path / "state.json"
    path.write_text(json.dumps({"https://x": {"price": 10.0}}), encoding="utf-8")
    result = load_state(path)
    assert result == {"https://x": {"price": 10.0}}


def test_save_state_writes_readable_json(tmp_path):
    path = tmp_path / "state.json"
    save_state(path, {"https://x": {"price": 10.0}})
    assert json.loads(path.read_text(encoding="utf-8")) == {"https://x": {"price": 10.0}}
