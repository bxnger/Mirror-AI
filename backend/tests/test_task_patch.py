"""PATCH /api/users/{user_id}/tasks/{task_id}: statuses and minute accounting."""
import pytest


@pytest.fixture()
def task_ctx(client):
    seed = client.post("/api/demo/seed").json()
    uid, (a, _) = seed["user_id"], seed["scenario_ids"]
    client.post(f"/api/users/{uid}/decisions", json={"scenario_id": a})
    plan = client.post(f"/api/users/{uid}/plans", json={}).json()
    t = plan["tasks"][0]
    return client, uid, plan, t


def patch(client, uid, tid, **b):
    return client.patch(f"/api/users/{uid}/tasks/{tid}", json=b)


def test_done_defaults_to_planned_minutes(task_ctx):
    c, uid, _, t = task_ctx
    r = patch(c, uid, t["id"], status="done")
    assert r.status_code == 200 and r.json()["actual_minutes"] == t["planned_minutes"]


def test_done_with_explicit_minutes_including_overtime(task_ctx):
    c, uid, _, t = task_ctx
    r = patch(c, uid, t["id"], status="done", actual_minutes=t["planned_minutes"] + 15)
    assert r.status_code == 200 and r.json()["actual_minutes"] == t["planned_minutes"] + 15


def test_partial_requires_minutes_between_1_and_planned(task_ctx):
    c, uid, _, t = task_ctx
    pm = t["planned_minutes"]
    assert patch(c, uid, t["id"], status="partial").status_code == 422
    assert patch(c, uid, t["id"], status="partial", actual_minutes=0).status_code == 422
    assert patch(c, uid, t["id"], status="partial", actual_minutes=pm).status_code == 422
    r = patch(c, uid, t["id"], status="partial", actual_minutes=pm - 10)
    assert r.status_code == 200 and (r.json()["status"], r.json()["actual_minutes"]) == ("partial", pm - 10)


def test_done_with_zero_minutes_rejected(task_ctx):
    c, uid, _, t = task_ctx
    assert patch(c, uid, t["id"], status="done", actual_minutes=0).status_code == 422


def test_skipped_and_pending_reset_minutes(task_ctx):
    c, uid, _, t = task_ctx
    patch(c, uid, t["id"], status="done")
    r = patch(c, uid, t["id"], status="skipped", actual_minutes=30)
    assert r.status_code == 200 and r.json()["actual_minutes"] == 0
    r = patch(c, uid, t["id"], status="pending")
    assert r.status_code == 200 and (r.json()["status"], r.json()["actual_minutes"]) == ("pending", 0)


def test_unknown_status_is_validation_error(task_ctx):
    c, uid, _, t = task_ctx
    assert patch(c, uid, t["id"], status="bogus").status_code == 422


def test_reviewed_plan_is_locked_and_accounting_matches(task_ctx):
    c, uid, plan, t = task_ctx
    pm = t["planned_minutes"]
    patch(c, uid, t["id"], status="partial", actual_minutes=pm - 10)
    rc = c.post(f"/api/users/{uid}/plans/{plan['id']}/reality-check", json={}).json()
    assert rc["actual_hours"] == round((pm - 10) / 60, 2)
    assert patch(c, uid, t["id"], status="done").status_code == 409
