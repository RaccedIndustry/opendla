# RFQ CRM

CRM for DoD RFQ bidding. NestJS API in `backend/`, SvelteKit SPA in `frontend/`, SQLite via TypeORM. Needs Node ≥ 22.17.

```sh
npm install
npm run dev     # API on http://localhost:3000/api, web on http://localhost:5173 (proxies /api)
npm run build   # backend/dist and frontend/build
```

- Login: `admin` / `admin`, seeded on first start. The session is an HttpOnly JWT cookie signed with `backend/data/jwt.secret` (auto-generated). Every API route needs it unless marked `@Public()`.
- Database: `backend/data/rfqcrm.sqlite`, created on first start. The schema auto-syncs from entities.
- Daily ingest cron (03:00 New York time): `backend/src/ingest/ingest.service.ts`. Reads the DIBBS RFQ dates page, downloads each new `ca{yymmdd}.zip`, unpacks its PDFs into `backend/data/archive/ca{yymmdd}/` and deletes the zip. Progress per file (`pending` → `downloaded` → `parsed`) is in the `archive` table; parsing isn't built yet. Needs `unzip` on PATH (built into macOS; `apt install unzip` on Debian/Ubuntu).
