# Hollandia HR — Leave Management App

A full-stack HR application for managing employee leave requests at Hollandia, with automated eligibility checking against all company leave policies.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + Tailwind CSS |
| Frontend Host | GitHub Pages (auto-deployed via GitHub Actions) |
| Backend | Node.js + Express 5 + TypeScript |
| Database | SQLite (better-sqlite3) on Railway Volume |
| Backend Host | Railway |

## Features

- **Employee Management** — Add/edit employees with hire date and loan tracking
- **Leave Request Form** — Submit leave requests with eligibility check on the spot
- **Eligibility Engine** — Automatically checks all 5 policy sections:
  - Minimum 1-year tenure
  - 50% loan repayment requirement
  - 75-day maximum duration (with blackout trim)
  - 4-month document validity rule + 6-month advisory
  - Departmental coverage caps
  - Seasonal company-wide allowances
- **Request Queue** — View all requests with status, denial reasons, and manual HR override
- **Policy Reference** — Built-in policy guide with all blocks, blackouts, and caps

## Project Structure

```
hollandia-hr/
├── backend/          Express API (deployed to Railway)
├── frontend/         React app (deployed to GitHub Pages)
└── .github/
    └── workflows/    CI/CD — auto-deploy frontend on push to main
```

## Getting Started

### Backend (local dev)

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

> Note: `better-sqlite3` requires build tools on Windows. On Railway (Linux), it builds automatically.

### Frontend (local dev)

```bash
cd frontend
npm install
npm run dev
```

Create `frontend/.env.local`:
```
VITE_API_URL=http://localhost:3001
```

## Deployment

### Railway (Backend)

1. Create a new Railway project
2. Add a service from this GitHub repo, root directory: `backend/`
3. Add a Volume mounted at `/app/data` for persistent SQLite storage
4. Set environment variables:
   - `CORS_ORIGIN` = your GitHub Pages URL
   - `DB_PATH` = `/app/data/hr.db`
5. Railway will auto-build using the `Dockerfile`

### GitHub Pages (Frontend)

1. Go to **Settings → Pages** → Source: **GitHub Actions**
2. Add repository secret: `VITE_API_URL` = your Railway backend URL
3. Add repository variable: `VITE_BASE_PATH` = `/hollandia-hr/` (replace with your repo name)
4. Push to `main` — GitHub Actions will build and deploy automatically

## Leave Policy Reference

| Period | Dates | Type |
|--------|-------|------|
| Block 1 | Nov 15 – Jan 25 | ✅ Approved |
| Blackout | Jan 26 – Feb 14 | 🚫 Valentine's Day |
| Block 2 | Feb 15 – Apr 19 | ✅ Approved |
| Blackout | Apr 20 – May 10 | 🚫 Mother's Day |
| Block 3 | May 11 – Jul 12 | ✅ Approved |
| Block 4 | Jul 13 – Sep 13 | ✅ Approved |
| Block 5 | Sep 14 – Nov 16 | ✅ Approved |