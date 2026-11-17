import os

# Must be set before the app is imported. Tests run on in-memory SQLite by default;
# set TEST_DATABASE_URL=postgresql+psycopg://... to run the same suite against PostgreSQL.
os.environ.setdefault("DATABASE_URL", (os.getenv("TEST_DATABASE_URL") or "sqlite://"))
os.environ["MIRROR_LLM"] = "off"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.db import Base, get_db, make_engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def engine():
    eng = make_engine((os.getenv("TEST_DATABASE_URL") or "sqlite://"))
    from app import models  # noqa: F401

    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture()
def db(engine):
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


@pytest.fixture()
def client(engine):
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
