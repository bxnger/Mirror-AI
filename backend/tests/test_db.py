from sqlalchemy import create_engine, inspect, text

from app.db import init_db


def test_init_db_adds_new_nullable_columns_to_existing_database(tmp_path):
    """An older database without reality_checks.ai_commentary keeps working after an upgrade."""
    eng = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    init_db(eng)
    with eng.begin() as conn:
        conn.execute(text('ALTER TABLE reality_checks DROP COLUMN ai_commentary'))
    assert "ai_commentary" not in {c["name"] for c in inspect(eng).get_columns("reality_checks")}
    init_db(eng)
    assert "ai_commentary" in {c["name"] for c in inspect(eng).get_columns("reality_checks")}
    init_db(eng)  # idempotent
