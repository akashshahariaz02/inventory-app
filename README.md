# HICC-SRC JV - Inventory Management System

A full-stack professional Inventory Management Web Application for Pipe, Construction Material, and Product stock management.

---

## 🗂️ Project Structure

```
hicc-src-jv-inventory/
├── backend/               ← Node.js + Express + SQLite
│   ├── server.js          ← Main server entry point
│   ├── database.js        ← SQLite DB setup & seeding
│   ├── middleware/
│   │   └── auth.js        ← JWT authentication
│   └── routes/
│       ├── auth.js        ← Login, register, users
│       ├── products.js    ← Inventory CRUD
│       ├── procurements.js← IN / Procurement entries
│       ├── issues.js      ← OUT / Issue entries
│       ├── requests.js    ← Request management
│       └── reports.js     ← Dashboard, reports, quotations
│
├── frontend/              ← React.js app
│   └── src/
│       ├── App.js         ← Routing
│       ├── api.js         ← Axios API calls
│       ├── index.css      ← Global styles
│       ├── context/
│       │   └── AuthContext.js
│       ├── components/
│       │   └── Sidebar.js
│       └── pages/
│           ├── Login.js
│           ├── Dashboard.js
│           ├── Inventory.js
│           ├── Procurement.js
│           ├── Issues.js
│           ├── Requests.js
│           ├── Quotations.js
│           ├── Reports.js
│           └── Users.js
│
├── package.json           ← Root scripts
├── hicc-src-jv.code-workspace
└── README.md
```

---

## ✅ Prerequisites — Install These First

Before running, make sure you have:

1. **Node.js** (version 18 or higher)
   - Download: https://nodejs.org
   - Verify: open terminal → `node --version`

2. **VS Code** (recommended)
   - Download: https://code.visualstudio.com

3. **Git** (optional, for cloning)
   - Download: https://git-scm.com

---

## 🚀 How to Run in VS Code — Step by Step

### Step 1 — Open the Project

1. Extract the ZIP file to any folder (e.g. Desktop → `hicc-src-jv-inventory`)
2. Open **VS Code**
3. Click **File → Open Folder**
4. Select the `hicc-src-jv-inventory` folder → click **Open**

---

### Step 2 — Open Two Terminals

In VS Code, open a terminal:
- Press **Ctrl + `** (backtick) OR go to **Terminal → New Terminal**

You'll need **two separate terminals** — one for backend, one for frontend.

To open a second terminal, click the **+** icon in the terminal panel.

---

### Step 3 — Install Backend Dependencies

In **Terminal 1**, type these commands one by one:

```bash
cd backend
npm install
```

Wait for it to finish (may take 1-2 minutes).

---

### Step 4 — Install Frontend Dependencies

In **Terminal 2**, type:

```bash
cd frontend
npm install
```

Wait for it to finish (may take 2-3 minutes).

---

### Step 5 — Start the Backend Server

In **Terminal 1** (inside backend folder), run:

```bash
npm run dev
```

You should see:
```
✅ Database seeded with default admin: admin@inventory.com / admin123
🚀 Inventory Server running on http://localhost:5000
📊 API Base: http://localhost:5000/api
```

---

### Step 6 — Start the Frontend

In **Terminal 2** (inside frontend folder), run:

```bash
npm start
```

After 30-60 seconds, your browser will automatically open:
```
http://localhost:3000
```

---

### Step 7 — Login

Use the default admin credentials:
- **Email:** `admin@inventory.com`
- **Password:** `admin123`

---

## 🔑 Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@inventory.com | admin123 |

You can create more users from the **Users & Roles** page after logging in.

---

## 👥 User Roles

| Role | Access |
|------|--------|
| **Admin** | Full access — everything |
| **Store Manager** | Manage inventory, approve requests |
| **Viewer** | View reports and submit requests only |

---

## 📋 Features

- ✅ Product / Inventory Management
- ✅ IN / Procurement entries (auto stock increase)
- ✅ OUT / Issue entries (auto stock decrease)
- ✅ Live Balance Calculation (IN - OUT)
- ✅ Request Management (Pending → Approved → Auto-Issue)
- ✅ Quotation Management
- ✅ Reports (Monthly, Weekly, Yearly) + CSV Export
- ✅ Dashboard with charts and low stock alerts
- ✅ Search & Filter across all pages
- ✅ User Roles & Permissions
- ✅ JWT Authentication
- ✅ SQLite database (no setup needed)

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login |
| GET | /api/products | Get all products |
| POST | /api/products | Create product |
| GET | /api/procurements | Get all procurements |
| POST | /api/procurements | Add procurement (stock increases) |
| GET | /api/issues | Get all issues |
| POST | /api/issues | Add issue (stock decreases) |
| GET | /api/requests | Get all requests |
| POST | /api/requests | Create request |
| PATCH | /api/requests/:id/approve | Approve request |
| GET | /api/reports/dashboard | Dashboard data |
| GET | /api/reports/summary | Full report |

---

## ⚙️ Configuration

Edit `backend/.env` to change settings:

```env
PORT=5000
JWT_SECRET=your_secret_key_here
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

---

## 🔧 Common Issues & Fixes

**Port already in use?**
```bash
# Kill process on port 5000 (Windows)
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:5000 | xargs kill
```

**npm install fails?**
- Make sure Node.js version is 18+: `node --version`
- Delete `node_modules` folder and try again

**Frontend shows blank page?**
- Make sure backend is running on port 5000
- Check browser console for errors (F12)

**Database reset?**
- Delete `backend/inventory.db`
- Restart backend — it will recreate with sample data

---

## 🚀 Production Build

```bash
# Build frontend
cd frontend
npm run build

# Set in backend/.env
NODE_ENV=production

# Start backend (serves frontend too)
cd backend
npm start
# Visit http://localhost:5000
```

---

## 📞 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React.js 18, React Router 6, Recharts |
| Backend | Node.js, Express.js |
| Database | SQLite (better-sqlite3) |
| Auth | JWT (JSON Web Tokens) |
| Styling | Custom CSS (no framework) |

---

Built for HICC-SRC JV
