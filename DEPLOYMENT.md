# FluxMind Deployment Guide (Google Cloud Run & Cloud SQL)

## Architecture Overview
- **Database**: Cloud SQL for PostgreSQL 15+
- **Backend Service**: Cloud Run (`fluxmind-backend`)
- **Frontend Service**: Cloud Run (`fluxmind-frontend`)

## Environment Variables & Secret Manager
Store these securely using Google Secret Manager or directly in the Cloud Run service configuration:

### Backend Variables
- `DATABASE_URL`: Connection string (e.g. `postgres://user:password@/fluxmind_db?host=/cloudsql/YOUR_PROJECT:REGION:INSTANCE_NAME`)
- `GEMINI_API_KEY`: Your Gemini API key
- `GOOGLE_OAUTH_CLIENT_ID`: OAuth client ID for Calendar/Gmail
- `GOOGLE_OAUTH_CLIENT_SECRET`: OAuth client secret
- `SESSION_SECRET`: Long random string for JWT signing
- `FRONTEND_URL`: **(See Deployment Order below)**

### Frontend Variables
- `NEXT_PUBLIC_BACKEND_URL`: **(See Deployment Order below)**

## Cloud SQL Setup
1. Create a PostgreSQL 15 instance in Cloud SQL.
2. Create database `fluxmind_db` and a user.
3. Use the `/database/init.sql` script to create tables and types.
4. When deploying the backend to Cloud Run, attach the Cloud SQL connection to enable the Unix socket at `/cloudsql/...`.

## Deployment Order (CORS Chicken-and-Egg Fix)
Because the frontend and backend run on separate Cloud Run domains, we face a circular dependency: the frontend needs `NEXT_PUBLIC_BACKEND_URL` at build time to make requests, and the backend needs `FRONTEND_URL` at runtime to allow CORS credentials. Both domains are only known after the first deploy.

**Follow this exact sequence:**

1. **Deploy Backend (Pass 1)**
   Deploy `fluxmind-backend` with a placeholder frontend URL:
   ```sh
   gcloud run deploy fluxmind-backend \
     --source ./backend \
     --set-env-vars FRONTEND_URL=https://placeholder.app \
     ...
   ```
   *Capture the resulting backend URL (e.g. `https://fluxmind-backend-xyz.a.run.app`).*

2. **Deploy Frontend**
   Before building, edit `frontend/next.config.js` to enable standalone output: `output: 'standalone'`.
   Deploy `fluxmind-frontend` with the captured backend URL:
   ```sh
   gcloud run deploy fluxmind-frontend \
     --source ./frontend \
     --set-env-vars NEXT_PUBLIC_BACKEND_URL=https://fluxmind-backend-xyz.a.run.app \
     --allow-unauthenticated
   ```
   *Capture the resulting frontend URL (e.g. `https://fluxmind-frontend-xyz.a.run.app`).*

3. **Redeploy Backend (Pass 2)**
   Update the backend's `FRONTEND_URL` to allow CORS from the actual frontend domain:
   ```sh
   gcloud run deploy fluxmind-backend \
     --source ./backend \
     --set-env-vars FRONTEND_URL=https://fluxmind-frontend-xyz.a.run.app \
     --allow-unauthenticated
   ```

**Result**: Both services are live, connected, and securely configured for CORS.
