# Free Test Deployment Guide

This setup is for client testing only. You do not need to buy a domain. Vercel and Render will give free testing links.

## Deployment Flow

```text
GitHub repository
  -> Render backend + PostgreSQL database
  -> Vercel frontend
  -> Client opens Vercel link
```

## Step 1: Push Latest Code To GitHub

This project is already connected to:

```text
https://github.com/akashshahariaz02/inventory-app.git
```

Do not upload `backend/.env`. It is ignored by `.gitignore`.

## Step 2: Deploy Backend On Render

1. Open Render.
2. Connect your GitHub account.
3. Create a new Blueprint from this repository.
4. Render should read `render.yaml`.
5. Render will create:
   - backend web service
   - PostgreSQL database
6. After deploy, copy the backend URL.

Example:

```text
https://hicc-src-inventory-backend.onrender.com
```

Backend environment variables:

```text
DATABASE_URL
JWT_SECRET
FRONTEND_URL
SMTP_USER
SMTP_PASS
MAIL_FROM
```

`DATABASE_URL` and `JWT_SECRET` can be created by Render from `render.yaml`.

Set these manually in Render:

```text
FRONTEND_URL=https://YOUR-VERCEL-FRONTEND.vercel.app
SMTP_USER=src.inventorysystem@gmail.com
SMTP_PASS=YOUR_GMAIL_APP_PASSWORD
MAIL_FROM=src.inventorysystem@gmail.com
```

## Step 3: Deploy Frontend On Vercel

1. Open Vercel.
2. Import this GitHub repository.
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

- Free Render backend may sleep when inactive, so first login can take 30-60 seconds.
- Free database limits are small.
- Google Drive local folder backup will not work on Render because Render cannot access your local computer drive.
- For real production, use paid hosting, monitored backups, HTTPS, and stronger infrastructure.
- Gmail SMTP requires Gmail App Password, not normal Gmail password.

