# Deployment guide

How the server was set up, how environment variables are managed, and how to reproduce the deployment from scratch.

The stack below is entirely free-tier and costs nothing.

| Piece | Platform | Why |
| --- | --- | --- |
| Database | **Neon** | Free serverless Postgres, no card required, sensible connection limits |
| API | **Render** (web service) | Free Node hosting, native health checks, auto-deploy from GitHub |
| Frontend | **Vercel** | Free static hosting, instant CDN, SPA rewrites built in |

> **AWS alternative.** The brief treats AWS as an optional bonus. The equivalent mapping is RDS Postgres → Elastic Beanstalk or ECS Fargate for the API → S3 + CloudFront for the client, with secrets in SSM Parameter Store. The Dockerfiles in this repo are production-ready and work unchanged on ECS. I stayed on free tiers as the brief instructs.

---

## 1 · Database — Neon

1. Sign up at [neon.tech](https://neon.tech) (GitHub login works).
2. **Create project** → name it `erp-crm` → pick the region closest to your API region.
3. From the dashboard, copy the **pooled** connection string. It looks like:

   ```
   postgresql://USER:PASSWORD@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

   Use the **pooled** endpoint (the one containing `-pooler`) — Render's free instances open more connections than a direct endpoint comfortably allows.

4. Keep this string safe. It is a secret and never goes into git.

Nothing else is needed — the schema is created by `prisma migrate deploy` during the API build.

---

## 2 · API — Render

### Create the service

1. Push this repository to GitHub.
2. On [render.com](https://render.com): **New → Web Service** → connect the repo.
3. Configure:

   | Setting | Value |
   | --- | --- |
   | Name | `erp-crm-api` |
   | Region | Same region as the Neon database |
   | Root directory | `server` |
   | Runtime | Node |
   | Build command | `npm ci && npx prisma generate && npx prisma migrate deploy && npm run build` |
   | Start command | `node dist/server.js` |
   | Health check path | `/health` |
   | Instance type | Free |

   Running `prisma migrate deploy` in the **build** step means a bad migration fails the build instead of crash-looping a live service.

4. Add the environment variables (Render dashboard → Environment):

   | Key | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | The Neon pooled string from step 1 |
   | `JWT_SECRET` | A fresh 64+ character random string (see below) |
   | `JWT_EXPIRES_IN` | `12h` |
   | `CORS_ORIGIN` | The Vercel URL — fill in after step 3, then redeploy |
   | `SEED_DEFAULT_PASSWORD` | `Password@123` |

   Generate the secret locally and paste it:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

   `PORT` is injected by Render automatically; the app reads it.

5. Deploy. When it goes live, check:

   ```bash
   curl https://erp-crm-api.onrender.com/health
   # {"status":"ok","database":"connected", ...}
   ```

### Seed the demo data (once)

Render dashboard → the service → **Shell**:

```bash
npm run seed
```

This wipes and reloads demo data, so run it once — not on every deploy. It prints the four role logins when it finishes.

### Blueprint alternative

`render.yaml` in the repo root provisions the database, API and static site together: **New → Blueprint** → point at the repo → apply. You still set `CORS_ORIGIN` and `VITE_API_URL` afterwards, and still run the seed once.

---

## 3 · Frontend — Vercel

1. On [vercel.com](https://vercel.com): **Add New → Project** → import the repo.
2. Configure:

   | Setting | Value |
   | --- | --- |
   | Framework preset | Vite |
   | Root directory | `client` |
   | Build command | `npm run build` |
   | Output directory | `dist` |

3. Environment variable:

   | Key | Value |
   | --- | --- |
   | `VITE_API_URL` | `https://erp-crm-api.onrender.com` (no trailing slash) |

4. Deploy.

`client/vercel.json` already contains the SPA rewrite, so a hard refresh on `/challans/:id` resolves correctly instead of 404-ing.

> **Vite inlines `VITE_*` at build time.** If you change `VITE_API_URL` later you must **redeploy**, not just restart. If the deployed app shows "Cannot reach the API", this is almost always the cause.

---

## 4 · Close the loop

1. Copy the Vercel URL (e.g. `https://erp-crm-portal.vercel.app`).
2. Set it as `CORS_ORIGIN` on the Render API service → **Manual Deploy → Deploy latest commit**.
3. Open the frontend and log in with any demo account.

To allow both the deployed frontend and local development, `CORS_ORIGIN` accepts a comma-separated list:

```
https://erp-crm-portal.vercel.app,http://localhost:5173
```

---

## How environment variables are managed

| Where | Mechanism |
| --- | --- |
| Local | `server/.env` and `client/.env`, both git-ignored. `.env.example` files are committed and document every variable. |
| Docker Compose | Declared inline in `docker-compose.yml` (development values only — never real secrets). |
| Render | Dashboard → Environment. Encrypted at rest, injected at build and runtime. `render.yaml` uses `generateValue: true` for `JWT_SECRET` so it is created by Render and never touches git. |
| Vercel | Project Settings → Environment Variables, inlined into the bundle at build time. |
| GitHub Actions | Non-secret values inline in the workflow (throwaway CI database and a dummy JWT secret). Real secrets would go in repository secrets. |

Rules followed throughout:

- **No secret is committed.** `.gitignore` excludes `.env` and allows `.env.example`.
- **Validated at boot.** `server/src/config/env.ts` parses the environment with Zod and exits with a readable message if anything is missing or malformed — a container that starts is a container that is configured.
- **No fallback secrets in code.** `JWT_SECRET` has no default; the app refuses to start without one, so a deploy can never silently sign tokens with a well-known value.

---

## Rotating the JWT secret

Changing `JWT_SECRET` invalidates every issued token, so all users are logged out — which is exactly what you want after a suspected leak.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Paste into Render → Environment → redeploy.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Cannot reach the API` in the browser | `VITE_API_URL` wrong or not applied | Set it in Vercel and **redeploy** (build-time inlining) |
| CORS error in the console | `CORS_ORIGIN` does not exactly match the frontend origin | Match scheme and host exactly, no trailing slash; redeploy the API |
| First request takes ~50 seconds | Render free tier sleeps after ~15 min idle | Expected. Warm it with a `/health` ping before a demo |
| `/health` returns `503 degraded` | Database unreachable | Check `DATABASE_URL`, confirm `?sslmode=require`, confirm the Neon project is not suspended |
| Login fails for every account | Seed never ran | Run `npm run seed` in the Render shell |
| Build fails on `prisma migrate deploy` | `DATABASE_URL` missing at build time | Environment variables must be set **before** the first deploy |
| `Too many connections` | Direct Neon endpoint instead of pooled | Switch to the `-pooler` connection string |

---

## Local Docker deployment

The whole stack runs locally with no cloud accounts:

```bash
docker compose up --build
docker compose exec api npm run seed
```

- Frontend → <http://localhost:5173> (nginx serving the built bundle)
- API → <http://localhost:4000>
- Postgres → `localhost:5432` (`postgres` / `postgres`)

Compose waits for the database's health check before starting the API, and the API applies migrations at container start.

Tear down, including the database volume:

```bash
docker compose down -v
```
