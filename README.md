# Open DLA Bid Core

A self-hosted, open-source (Apache-2.0) toolkit for DLA vendors. Each morning it pulls the day's DIBBS RFQs and turns them into a searchable list of lines with approved sources, due dates, set-asides and past award prices. It runs on your own machine, and nothing leaves it: the only outside site it talks to is DIBBS's public download pages.

## What works today

- **Daily job** (03:00 New York time). It fetches the day's RFQ PDFs and its daily index from DIBBS's public pages. No DIBBS login is used or stored.
- **RFQ parser.** It turns every PDF into lines (CLINs), approved sources (CAGE + part number), requirement codes, packaging, first article, clauses and procurement history. It was checked against all 3,347 RFQs of 2026-10-22.
- **RFQs page.** One row per line, with:
  - its due date, taken from the daily index (which beats the PDF for a re-posted RFQ)
  - set-aside code, AMSC and approved-source CAGEs
  - the latest known award (price × quantity · CAGE · date)
  - flags for controlled data (CUI or export control) and first article

  Search covers all RFQ text. Click an RFQ to see its full record and every award on file for its NSN.
- **Archives page.** One row per DIBBS day, with the files it skipped and why, and when the job last reached DIBBS.

Not built yet: matching to your catalog, supplier outreach, pricing, the quote checker and the batch-quote file. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the design and the roadmap.

## Run it

You need Docker.

```bash
docker compose up -d --build
```

Then open <http://localhost:3000>.

**First login.** Log in as `admin` with the password printed once in the log:

```bash
docker compose logs app | grep "Created user admin"
```

**Setting or resetting the password.** To choose the password yourself, or to reset a lost one, set `ADMIN_PASSWORD` in `.env` and run `docker compose up -d`. A plain `docker compose restart` keeps the old settings. The password is applied on every start while it is set. Then add your colleagues on the Users page.

**Signing everyone out.** A password reset doesn't end sessions that are already open. To sign everyone out too, for example after a leak or when someone who knew the password leaves:

1. Run `docker compose exec app rm data/jwt.secret`.
2. Run `docker compose up -d`. A new key is made at start.
3. Delete any user you don't recognize on the Users page.

**Settings.** Put these in a `.env` file next to `compose.yaml`:

- `BIND`: by default only this machine can open the app. Set `BIND` to this machine's LAN address to open it to your office. Keep it off the internet.
- `PORT`: changes the port.
- `ADMIN_PASSWORD`: see above.

**Demo data.** On first start the app shows a demo day: 102 real RFQs from 2026-10-22, tagged demo. The job skips it. Adding 2026-10-22 on the Archives page, while DIBBS still lists that day, replaces it with the real day.

**DIBBS consent banner.** DIBBS shows a DoD Notice and Consent banner before any download. The job clicks through it the way a browser user would. You remain responsible for using DIBBS within DLA's terms.

## Your data

Everything lives in the Docker volume `open-dla-bid-core_data`: the SQLite database, the login session key (`jwt.secret`) and each day's PDFs.

**Disk use.** Expect about 1.4 GB of PDFs per DIBBS day plus about 80 MB of database. The PDFs are kept so that a day can be parsed again. To free space, delete old day folders:

```bash
docker compose exec app rm -r data/archive/ca261022
```

The RFQs stay; only that day can no longer be parsed again.

**Back up before upgrading.** `data.tgz` holds your login key and password hashes, so keep it private:

```bash
docker compose stop
docker compose run --rm --no-deps -u root -v "$PWD":/backup app sh -c 'umask 077 && tar czf /backup/data.tgz -C data .'
docker compose start
```

**Restore**, with the app stopped:

```bash
docker compose run --rm --no-deps -u root -v "$PWD":/backup app tar xzf /backup/data.tgz -C data
```

**Upgrade.** Back up, get the new version, then run `docker compose up -d --build`. Database migrations run at start. To roll back, go back to the previous version and restore the backup.

**Never run `docker compose down -v`.** The `-v` deletes the volume and every parsed day with it.

## Develop

You need Node 22.18+ or 24.11+ (the Docker image uses Node 24) and `unzip` on PATH (built into macOS; `apt install unzip` on Debian/Ubuntu).

```bash
npm install
npm run dev     # API on http://localhost:3000/api, web on http://localhost:5173 (proxies /api)
```

- **Tests:**
  - backend unit: `npm test -w backend`
  - backend end-to-end: `npm run test:e2e -w backend`
  - frontend type check: `npm run check -w frontend`

  Tests use an in-memory database.
- **Database:** `backend/data/rfqcrm.sqlite`. The schema comes from the migrations in `backend/src/migrations`, which run at start. After changing an entity:
  1. Run `npm run migration:generate -w backend -- src/migrations/<Name>`.
  2. Add the new class to `migrations` in `backend/src/data-source.ts`.
- **Login:** the session is an HttpOnly JWT cookie signed with `backend/data/jwt.secret`, which is generated on first start. Every API route needs it unless marked `@Public()`.
- **Parser CLI:** `npm run build -w backend`, then `node backend/dist/parser/parse.js <out-dir> <pdf>...`. It writes one JSON per PDF into an existing folder.
- **Where things are:**

  | Part | Path |
  |---|---|
  | M1 ingest | `backend/src/ingest` |
  | M3 parser | `backend/src/parser` |
  | M2 store | `backend/src/solicitations`, `migrations`, `data-source.ts` |
  | Web UI | `frontend/src/routes` |

  The modules are described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

[Apache-2.0](LICENSE).
