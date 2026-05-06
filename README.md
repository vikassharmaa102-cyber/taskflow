# ⚡ TaskFlow — Team Task Manager

A full-stack team task management web app with role-based access control, built with **Node.js + Express + SQLite** backend and a **React SPA** frontend.

---

## 🚀 Live Demo

> **[https://taskflow.up.railway.app](https://taskflow.up.railway.app)**  
> *(Replace with your Railway URL after deployment)*

---

## ✨ Features

### Authentication
- JWT-based signup & login
- Passwords hashed with bcryptjs
- First registered user is automatically **Admin**
- 7-day token expiry

### Role-Based Access Control
| Feature | Admin | Member |
|---|---|---|
| View all projects | ✅ | ❌ (own only) |
| Create projects | ✅ | ✅ |
| Delete any project | ✅ | ❌ |
| Manage project members | ✅ (project admin) | ❌ |
| Create tasks | ✅ | ✅ (in own projects) |
| Edit any task | ✅ | Own tasks only |
| Delete tasks | ✅ | Own tasks only |
| Manage user roles | ✅ | ❌ |

### Projects
- Create, view, delete projects
- Add/remove team members with roles (Admin/Member)
- Per-project role system independent of system role

### Tasks
- Create tasks with title, description, priority, status, assignee, due date
- Status tracking: `To Do → In Progress → Review → Done`
- Priority levels: Low / Medium / High
- One-click status toggle (todo ↔ done)
- Filter tasks by status
- Overdue detection

### Dashboard
- Task status breakdown with progress bars
- Overdue tasks panel
- Recent activity feed
- Stats: projects, users, tasks (role-dependent)

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js |
| Database | SQLite (via better-sqlite3) |
| Auth | JWT + bcryptjs |
| Frontend | React 18 (CDN, no build step) |
| Styling | Vanilla CSS (custom design system) |
| Deployment | Railway |

---

## 📁 Project Structure

```
taskflow/
├── server.js          # Express app + all REST APIs
├── package.json       
├── railway.json       # Railway deployment config
├── Procfile           
├── .gitignore         
├── README.md          
└── public/
    └── index.html     # React SPA (single file)
```

---

## 🔌 API Endpoints

### Auth
```
POST   /api/auth/signup        Register new user
POST   /api/auth/login         Login
GET    /api/auth/me            Get current user
```

### Users
```
GET    /api/users              List all users (auth required)
PATCH  /api/users/:id/role     Change user role (admin only)
```

### Projects
```
GET    /api/projects           List accessible projects
POST   /api/projects           Create project
GET    /api/projects/:id       Get project details
PUT    /api/projects/:id       Update project
DELETE /api/projects/:id       Delete project
```

### Project Members
```
GET    /api/projects/:id/members         List members
POST   /api/projects/:id/members         Add member
DELETE /api/projects/:id/members/:uid    Remove member
```

### Tasks
```
GET    /api/projects/:id/tasks           List tasks
POST   /api/projects/:id/tasks           Create task
PUT    /api/projects/:id/tasks/:tid      Update task
DELETE /api/projects/:id/tasks/:tid      Delete task
```

### Dashboard
```
GET    /api/dashboard          Get stats & overview
```

---

## 🗄 Database Schema

```sql
users          -- id, name, email, password, role
projects       -- id, name, description, owner_id
project_members -- project_id, user_id, role
tasks          -- id, project_id, title, description, 
                  status, priority, assigned_to, created_by, 
                  due_date, created_at, updated_at
```

---

## 🧑‍💻 Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/taskflow.git
cd taskflow

# 2. Install dependencies
npm install

# 3. Start the server
npm start

# 4. Open browser
http://localhost:3000
```

**No environment variables required for local dev.** For production, set:
```
JWT_SECRET=your_strong_secret_here
PORT=3000
```

---

## 🚂 Deploy on Railway

### Option A — Railway CLI
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Option B — GitHub Integration (Recommended)
1. Push code to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Select your repo
4. Add environment variable: `JWT_SECRET=your_secret`
5. Railway auto-detects Node.js and deploys

> **Note on SQLite + Railway:** Railway has an ephemeral filesystem — data resets on redeploy. For persistent data, add a **Railway PostgreSQL** plugin and migrate the schema, or use Railway's **Volume** feature for SQLite persistence.

---

## 🧪 Test Accounts (after first signup)

| Step | Action |
|---|---|
| 1 | Sign up → automatically becomes **Admin** |
| 2 | Create a project |
| 3 | Sign up with a second account → becomes **Member** |
| 4 | Admin adds Member to project |
| 5 | Member can create & manage tasks in that project |

---

## 📸 Screenshots

> Dashboard · Projects · Task Board · User Management

---

## 📜 License

MIT — free to use and modify.
