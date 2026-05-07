# Track

A full-stack job application tracker that automatically syncs your Gmail, classifies emails using AI, and gives you a clean dashboard to monitor every stage of your job search.

## Features

- **Gmail sync** — reads all emails from a `companies` Gmail label and extracts application data
- **AI classification** — uses Claude to parse company name, role, recruiter, stage, and interview count from raw emails
- **Company enrichment** — auto-fetches industry and company size for each application
- **Dashboard** — filterable table with stage pills, date range, company size, and free-text search
- **Charts** — stage breakdown donut, interviews-per-company bar chart, company size donut (all filter-responsive)
- **Light / dark mode** — system-preference aware with a manual toggle
- **Recruiter email backfill** — extracts recruiter emails from stored raw emails without re-syncing

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React, Vite, Tailwind CSS v4, D3.js |
| Backend | Node.js, Express |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth + Google OAuth |
| AI | Anthropic Claude (Haiku) |

## Project Structure

```
├── frontend/        # React app (Vite)
├── backend/         # Express API server
└── supabase/        # SQL migrations
```

## Setup

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A Google Cloud project with Gmail API + OAuth enabled
- An [Anthropic](https://console.anthropic.com) API key

### 1. Database

Run the migrations in order in the Supabase SQL editor:

```
supabase/migration_001.sql
supabase/migration_002.sql
supabase/migration_003.sql
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # fill in your keys
npm install
npm run dev
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env   # fill in your Supabase URL + anon key
npm install
npm run dev
```

### Environment Variables

**`backend/.env`**
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
PORT=3001
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback
ANTHROPIC_API_KEY=
```

**`frontend/.env`**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

### 4. Gmail Label

Create a label called `companies` in Gmail and apply it to all your job-related emails. The sync button will read exclusively from that label.

## Usage

1. Sign in with Google
2. Click the **sync** icon (↻) in the top-right of the dashboard
3. Emails are fetched, classified, and stored — company data is enriched automatically
4. Use the filter bar to search by company/role, filter by stage or company size, or narrow by date range
