# RFQ CRM

CRM for DoD RFQ bidding. NestJS API in `backend/`, SvelteKit SPA in `frontend/`, SQLite via TypeORM. Needs Node ≥ 22.17.

```sh
npm install
npm run dev     # API on http://localhost:3000/api, web on http://localhost:5173 (proxies /api)
npm run build   # backend/dist and frontend/build
```

- Database: `backend/data/rfqcrm.sqlite`, created on first start. The schema auto-syncs from entities.
- Daily ingest cron: `backend/src/ingest/ingest.service.ts` (fetch → unzip with fflate → parse → save).
