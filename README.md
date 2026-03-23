# Ogwu 🏥

> Telehealth app for the underdeveloped market

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | Expo (React Native)                 |
| Backend   | Node.js + Express (Railway / Render)|
| Database  | Supabase (Postgres + Auth + Storage)|

## Project Structure

```
ogwu/
├── mobile/          # Expo React Native app
├── backend/         # Node.js + Express API server
└── supabase/        # Supabase migrations & config
```

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9
- Expo CLI (use the project-bundled CLI via `npx expo ...`)
- Supabase CLI (`npm install -g supabase`)
- A [Supabase](https://supabase.com) project

### 1. Clone the repository

```bash
git clone https://github.com/iheomach/ogwu.git
cd ogwu
```

### 2. Set up the backend

```bash
cd backend
cp .env.example .env
# Edit .env with your Supabase credentials
npm install
npm run dev
```

### 3. Set up the mobile app

```bash
cd mobile
cp .env.example .env
# Edit .env with your Supabase credentials
npm install
npx expo start
```

### 4. Set up Supabase (cloud)

1) Create a Supabase project (Dashboard → New project)

2) Copy credentials (Dashboard → Project Settings → API)
- Project URL
- `anon` public key
- `service_role` key (server-only)

3) Fill in env files
- Backend: `backend/.env`
	- `SUPABASE_URL`
	- `SUPABASE_SERVICE_ROLE_KEY`
- Mobile: `mobile/.env`
	- `EXPO_PUBLIC_SUPABASE_URL`
	- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
	- `EXPO_PUBLIC_API_URL`
		- If testing on a physical device, use your computer LAN IP (not `localhost`).
		- Example: if Expo shows `exp://192.168.12.220:8081`, set `EXPO_PUBLIC_API_URL=http://192.168.12.220:3000`.

4) Push the database migration to Supabase Cloud

This repo includes a migration at `supabase/migrations/001_initial_schema.sql`.

Option A (recommended, via CLI):
```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Option B (via Dashboard):
- SQL Editor → paste the contents of `supabase/migrations/001_initial_schema.sql` → Run

### 5. (Optional) Supabase local development

```bash
supabase start
supabase db push
```

## Environment Variables

### Backend (`backend/.env`)

| Variable                    | Description                        |
|-----------------------------|------------------------------------|
| `PORT`                      | Server port (default: 3000)        |
| `SUPABASE_URL`              | Your Supabase project URL          |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (keep secret!)    |

### Mobile (`mobile/.env`)

| Variable                        | Description                      |
|---------------------------------|----------------------------------|
| `EXPO_PUBLIC_SUPABASE_URL`      | Your Supabase project URL        |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key         |
| `EXPO_PUBLIC_API_URL`           | Backend API URL                  |

## API Endpoints

| Method | Path                | Description           |
|--------|---------------------|-----------------------|
| GET    | `/health`           | Health check          |
| POST   | `/api/auth/signup`  | Create a new account  |
| POST   | `/api/auth/signin`  | Sign in               |
| GET    | `/api/users/:id`    | Get user profile      |
| PUT    | `/api/users/:id`    | Update user profile   |

## Deployment

### Backend (Railway or Render)

1. Create a new service pointing to the `backend/` directory
2. Set environment variables from `backend/.env.example`
3. The start command is `npm start`

### Mobile (Expo)

```bash
cd mobile
# or using EAS Build:
npx eas build
```

## MVP Notes

The MVP spec is in `ogwu_mvp.md`. This repository currently contains:
- `mobile/`: Patient mobile app (Expo)
- `backend/`: Express API
- `supabase/`: Schema/migrations

The Doctor dashboard described in the MVP doc is planned work and is not yet implemented in this repo.

## License

MIT
