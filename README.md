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
- Expo CLI (`npm install -g expo-cli`)
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

### 4. Set up Supabase (local development)

```bash
supabase init   # if not already done
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
npx expo build:android
npx expo build:ios
# or using EAS Build:
npx eas build
```

## License

MIT
