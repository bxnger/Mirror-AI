# MIRROR AI — frontend

Future Self Simulator: compare two paths of a decision against your real time, skills and constraints, then turn the chosen path into a weekly plan.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm start
```

**Demo mode.** There is no backend yet. Comparisons are computed locally with transparent rules (`src/domain/analysis.ts`), and all data lives in the browser's localStorage. "Открыть демо-профиль" loads a fictional example profile, badged as demo data.

See `CLAUDE.md` for the code map and `docs/backend-contract.md` for the proposed API.

## Backend

FastAPI + PostgreSQL + LLM (Claude) live in [`backend/`](backend/README.md): Current Self / Future Self, Gap Analysis,
What If Lab, Action Plan, Reality Check and Adaptive Memory, with a built-in demo console at `http://localhost:8000`.

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000
```
