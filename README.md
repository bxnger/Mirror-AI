# MIRROR AI — frontend

Future Self Simulator: compare two paths of a decision against your real time, skills and constraints, then turn the chosen path into a weekly plan.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm start
```

### Modes
| Mode | Data | How |
|---|---|---|
| `demo` (default) | localStorage, transparent local rules | `npm run dev` |
| `remote` | FastAPI backend in `backend/` is the source of truth | see below |

The fictional one-click demo ("Открыть демо-профиль") works in both modes and never touches the backend.

### Run frontend + backend together
```bash
# 1. backend (port 8000)
cd backend && pip install -r requirements.txt && python -m uvicorn app.main:app --port 8000

# 2. frontend in remote mode (port 3000), in another terminal
cp .env.example .env.local        # NEXT_PUBLIC_MIRROR_API_MODE=remote, MIRROR_BACKEND_URL=http://localhost:8000
npm run dev
```
The browser talks to `/mirror-api/*` on port 3000, which Next.js proxies to the backend (no CORS, no
backend URL in the browser). `NEXT_PUBLIC_MIRROR_API_MODE` and `MIRROR_BACKEND_URL` are read at build
time, so set them before `npm run build`. Contract, mapping and known gaps: `docs/backend-contract.md`.

See `CLAUDE.md` for the code map.

## Backend

FastAPI + PostgreSQL + LLM (Claude) live in [`backend/`](backend/README.md): Current Self / Future Self, Gap Analysis,
What If Lab, Action Plan, Reality Check and Adaptive Memory, with a built-in demo console at `http://localhost:8000`.

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000
```
