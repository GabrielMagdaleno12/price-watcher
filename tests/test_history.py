import json

from history import append_snapshot, load_history, save_history


def test_load_history_missing_file_returns_empty_dict(tmp_path):
    result = load_history(tmp_path / "history.json")
    assert result == {}


def test_load_history_reads_existing_json(tmp_path):
    path = tmp_path / "history.json"
    path.write_text(
        json.dumps({"https://x": [{"price": 10.0, "checked_at": "t1"}]}),
        encoding="utf-8",
    )
    result = load_history(path)
    assert result == {"https://x": [{"price": 10.0, "checked_at": "t1"}]}


def test_save_history_writes_readable_json(tmp_path):
    path = tmp_path / "history.json"
    save_history(path, {"https://x": [{"price": 10.0, "checked_at": "t1"}]})
    assert json.loads(path.read_text(encoding="utf-8")) == {
        "https://x": [{"price": 10.0, "checked_at": "t1"}]
    }


def test_append_snapshot_adds_point_to_new_url():
    history = {}
    snapshot = {"https://x": {"price": 10.0, "checked_at": "t1"}}
    result = append_snapshot(history, snapshot)
    assert result == {"https://x": [{"price": 10.0, "checked_at": "t1"}]}


def test_append_snapshot_appends_to_existing_url():
    history = {"https://x": [{"price": 10.0, "checked_at": "t1"}]}
    snapshot = {"https://x": {"price": 9.0, "checked_at": "t2"}}
    result = append_snapshot(history, snapshot)
    assert result == {
        "https://x": [
            {"price": 10.0, "checked_at": "t1"},
            {"price": 9.0, "checked_at": "t2"},
        ]
    }


def test_append_snapshot_does_not_mutate_input_history():
    history = {"https://x": [{"price": 10.0, "checked_at": "t1"}]}
    snapshot = {"https://x": {"price": 9.0, "checked_at": "t2"}}
    append_snapshot(history, snapshot)
    assert history == {"https://x": [{"price": 10.0, "checked_at": "t1"}]}
