# Free Test Deployment Guide

This setup is for client testing only. For real production, use paid hosting, a paid database, HTTPS, and monitored backups.

## Free Testing Option

- Frontend: Vercel or Netlify free static hosting.
- Backend: Render free web service.
- Database: Render PostgreSQL or another hosted PostgreSQL service.

You do not need to buy a domain for testing. Free platforms give you temporary URLs like:

```text
https://hicc-src-inventory.vercel.app
https://hicc-src-inventory-backend.onrender.com
```

## Step 1: Push Project To GitHub

Create a GitHub repository and push this project.

Do not upload `backend/.env`. It is ignored by `.gitignore`.

## Step 2: Deploy Backend On Render

1. Open Render.
2. Connect your GitHub account.
3. Create a new Blueprint from this repository.
4. Render can read `render.yaml`.
5. After backend deploys, copy the backend URL.

Example:

```text
https://hicc-src-inventory-backend.onrender.com
```

Backend environment variables needed:

```text
DATABASE_URL
JWT_SECRET
FRONTEND_URL
SMTP_USER
SMTP_PASS
MAIL_FROM
```

`DATABASE_URL` and `JWT_SECRET` can be created by Render from `render.yaml`.

Set `FRONTEND_URL` after frontend is deployed.

## Step 3: Deploy Frontend On Vercel

1. Open Vercel.
2. Import the same GitHub repository.
3. Set project root/directory:

```text
frontend
```

4. Build command:

```text
npm run build
```

5. Output directory:

```text
build
```

6. Add environment variable:

```text
REACT_APP_API_URL=https://YOUR-BACKEND-URL.onrender.com/api
```

Then deploy.

## Step 4: Update Backend CORS

After frontend deploys, copy frontend URL.

Example:

```text
https://hicc-src-inventory.vercel.app
```

In Render backend environment variables, set:

```text
FRONTEND_URL=https://hicc-src-inventory.vercel.app
```

Then redeploy/restart backend.

## Important Notes

- Free backend services may sleep when inactive, so first load can be slow.
- Free database limits are small.
- Google Drive backup folder will not work on Render because Render cannot access your local `G:\My Drive`.
- For real production backup, use cloud database backups or external object storage.
- Email requires Gmail App Password, not normal Gmail password.
