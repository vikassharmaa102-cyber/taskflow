const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'taskflow_secret_key_2024_change_in_prod';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'taskflow.db');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── DATABASE WRAPPER ─────────────────────────────────────────────────────────
let db;

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function dbRun(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

function dbGet(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ─── INIT DATABASE ────────────────────────────────────────────────────────────
async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    owner_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS project_members (
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, user_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium',
    assigned_to TEXT,
    created_by TEXT NOT NULL,
    due_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  saveDb();
  console.log('✅ Database initialized');
}

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const adminAuth = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = dbGet('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return res.status(400).json({ error: 'Email already registered' });

  const id = uuidv4();
  const hashedPassword = bcrypt.hashSync(password, 10);
  const countRow = dbGet('SELECT COUNT(*) as cnt FROM users', []);
  const role = (!countRow || countRow.cnt === 0) ? 'admin' : 'member';

  dbRun('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
    [id, name, email, hashedPassword, role]);

  const token = jwt.sign({ id, name, email, role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id, name, email, role } });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = dbGet('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET, { expiresIn: '7d' }
  );
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = dbGet('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [req.user.id]);
  res.json(user);
});

// ─── USERS ROUTES ─────────────────────────────────────────────────────────────
app.get('/api/users', auth, (req, res) => {
  const users = dbAll('SELECT id, name, email, role, created_at FROM users ORDER BY name', []);
  res.json(users);
});

app.patch('/api/users/:id/role', auth, adminAuth, (req, res) => {
  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  dbRun('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
  res.json({ success: true });
});

// ─── PROJECT ROUTES ───────────────────────────────────────────────────────────
app.get('/api/projects', auth, (req, res) => {
  let projects;
  if (req.user.role === 'admin') {
    projects = dbAll(`
      SELECT p.*, u.name as owner_name,
        (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count
      FROM projects p JOIN users u ON p.owner_id = u.id ORDER BY p.created_at DESC
    `, []);
  } else {
    projects = dbAll(`
      SELECT p.*, u.name as owner_name, pm.role as my_role,
        (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count
      FROM projects p 
      JOIN users u ON p.owner_id = u.id
      JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
      ORDER BY p.created_at DESC
    `, [req.user.id]);
  }
  res.json(projects);
});

app.post('/api/projects', auth, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name required' });

  const id = uuidv4();
  dbRun('INSERT INTO projects (id, name, description, owner_id) VALUES (?, ?, ?, ?)',
    [id, name, description || '', req.user.id]);
  dbRun('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)',
    [id, req.user.id, 'admin']);

  res.json({ id, name, description, owner_id: req.user.id });
});

app.get('/api/projects/:projectId', auth, (req, res) => {
  const { projectId } = req.params;
  const project = dbGet(
    `SELECT p.*, u.name as owner_name FROM projects p JOIN users u ON p.owner_id = u.id WHERE p.id = ?`,
    [projectId]
  );
  if (!project) return res.status(404).json({ error: 'Project not found' });

  if (req.user.role !== 'admin') {
    const member = dbGet('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, req.user.id]);
    if (!member) return res.status(403).json({ error: 'Access denied' });
    project.my_role = member.role;
  } else {
    project.my_role = 'admin';
  }
  res.json(project);
});

app.put('/api/projects/:projectId', auth, (req, res) => {
  const { projectId } = req.params;
  const { name, description } = req.body;
  const member = dbGet('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
    [projectId, req.user.id]);
  if (!member || (member.role !== 'admin' && req.user.role !== 'admin')) {
    return res.status(403).json({ error: 'Access denied' });
  }
  dbRun('UPDATE projects SET name = ?, description = ? WHERE id = ?', [name, description, projectId]);
  res.json({ success: true });
});

app.delete('/api/projects/:projectId', auth, (req, res) => {
  const { projectId } = req.params;
  const project = dbGet('SELECT * FROM projects WHERE id = ?', [projectId]);
  if (!project) return res.status(404).json({ error: 'Not found' });
  if (project.owner_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  dbRun('DELETE FROM tasks WHERE project_id = ?', [projectId]);
  dbRun('DELETE FROM project_members WHERE project_id = ?', [projectId]);
  dbRun('DELETE FROM projects WHERE id = ?', [projectId]);
  res.json({ success: true });
});

// ─── PROJECT MEMBERS ─────────────────────────────────────────────────────────
app.get('/api/projects/:projectId/members', auth, (req, res) => {
  const { projectId } = req.params;
  const members = dbAll(`
    SELECT u.id, u.name, u.email, u.role as system_role, pm.role as project_role, pm.joined_at
    FROM project_members pm JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ? ORDER BY u.name
  `, [projectId]);
  res.json(members);
});

app.post('/api/projects/:projectId/members', auth, (req, res) => {
  const { projectId } = req.params;
  const { userId, role = 'member' } = req.body;
  const caller = dbGet('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
    [projectId, req.user.id]);
  if (!caller || (caller.role !== 'admin' && req.user.role !== 'admin')) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const existing = dbGet('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?',
    [projectId, userId]);
  if (existing) return res.status(400).json({ error: 'User already in project' });

  dbRun('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)', [projectId, userId, role]);
  res.json({ success: true });
});

app.delete('/api/projects/:projectId/members/:userId', auth, (req, res) => {
  const { projectId, userId } = req.params;
  const caller = dbGet('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
    [projectId, req.user.id]);
  if (!caller || (caller.role !== 'admin' && req.user.role !== 'admin')) {
    return res.status(403).json({ error: 'Access denied' });
  }
  dbRun('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
  res.json({ success: true });
});

// ─── TASK ROUTES ─────────────────────────────────────────────────────────────
app.get('/api/projects/:projectId/tasks', auth, (req, res) => {
  const { projectId } = req.params;
  const tasks = dbAll(`
    SELECT t.*, 
      u1.name as assigned_to_name, u1.email as assigned_to_email,
      u2.name as created_by_name
    FROM tasks t
    LEFT JOIN users u1 ON t.assigned_to = u1.id
    LEFT JOIN users u2 ON t.created_by = u2.id
    WHERE t.project_id = ?
    ORDER BY t.created_at DESC
  `, [projectId]);
  res.json(tasks);
});

app.post('/api/projects/:projectId/tasks', auth, (req, res) => {
  const { projectId } = req.params;
  const { title, description, priority = 'medium', assigned_to, due_date } = req.body;
  if (!title) return res.status(400).json({ error: 'Task title required' });

  const member = dbGet('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
    [projectId, req.user.id]);
  if (!member && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

  const id = uuidv4();
  dbRun(`INSERT INTO tasks (id, project_id, title, description, priority, assigned_to, created_by, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, projectId, title, description || '', priority, assigned_to || null, req.user.id, due_date || null]);

  res.json({ id, title, description, priority, assigned_to, due_date, status: 'todo', project_id: projectId });
});

app.put('/api/projects/:projectId/tasks/:taskId', auth, (req, res) => {
  const { projectId, taskId } = req.params;
  const { title, description, status, priority, assigned_to, due_date } = req.body;

  const task = dbGet('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const member = dbGet('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
    [projectId, req.user.id]);
  if (!member && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

  if (member && member.role === 'member' && task.created_by !== req.user.id && task.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'You can only update tasks assigned to you' });
  }

  const now = new Date().toISOString();
  dbRun(`UPDATE tasks SET title=?, description=?, status=?, priority=?, assigned_to=?, due_date=?, updated_at=? WHERE id=?`,
    [
      title ?? task.title,
      description ?? task.description,
      status ?? task.status,
      priority ?? task.priority,
      assigned_to !== undefined ? (assigned_to || null) : task.assigned_to,
      due_date !== undefined ? (due_date || null) : task.due_date,
      now,
      taskId
    ]);

  res.json({ success: true });
});

app.delete('/api/projects/:projectId/tasks/:taskId', auth, (req, res) => {
  const { projectId, taskId } = req.params;
  const task = dbGet('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
  if (!task) return res.status(404).json({ error: 'Not found' });

  const member = dbGet('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
    [projectId, req.user.id]);
  if (!member && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  if (member && member.role === 'member' && task.created_by !== req.user.id) {
    return res.status(403).json({ error: 'Only task creator or admin can delete' });
  }

  dbRun('DELETE FROM tasks WHERE id = ?', [taskId]);
  res.json({ success: true });
});

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
app.get('/api/dashboard', auth, (req, res) => {
  let stats = {};
  const today = new Date().toISOString().split('T')[0];

  if (req.user.role === 'admin') {
    stats.total_projects = (dbGet('SELECT COUNT(*) as c FROM projects', []) || {}).c || 0;
    stats.total_users = (dbGet('SELECT COUNT(*) as c FROM users', []) || {}).c || 0;
    stats.total_tasks = (dbGet('SELECT COUNT(*) as c FROM tasks', []) || {}).c || 0;
    stats.tasks_by_status = dbAll('SELECT status, COUNT(*) as count FROM tasks GROUP BY status', []);
    stats.overdue_tasks = dbAll(`
      SELECT t.*, p.name as project_name, u.name as assigned_to_name
      FROM tasks t JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.due_date < ? AND t.status != 'done'
      ORDER BY t.due_date ASC LIMIT 10
    `, [today]);
    stats.recent_tasks = dbAll(`
      SELECT t.*, p.name as project_name, u.name as assigned_to_name
      FROM tasks t JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.assigned_to = u.id
      ORDER BY t.updated_at DESC LIMIT 8
    `, []);
  } else {
    stats.my_projects = (dbGet('SELECT COUNT(*) as c FROM project_members WHERE user_id = ?', [req.user.id]) || {}).c || 0;
    stats.my_tasks = (dbGet('SELECT COUNT(*) as c FROM tasks WHERE assigned_to = ?', [req.user.id]) || {}).c || 0;
    stats.tasks_by_status = dbAll('SELECT status, COUNT(*) as count FROM tasks WHERE assigned_to = ? GROUP BY status', [req.user.id]);
    stats.overdue_tasks = dbAll(`
      SELECT t.*, p.name as project_name
      FROM tasks t JOIN projects p ON t.project_id = p.id
      WHERE t.assigned_to = ? AND t.due_date < ? AND t.status != 'done'
      ORDER BY t.due_date ASC LIMIT 10
    `, [req.user.id, today]);
    stats.recent_tasks = dbAll(`
      SELECT t.*, p.name as project_name
      FROM tasks t JOIN projects p ON t.project_id = p.id
      WHERE t.assigned_to = ? OR t.created_by = ?
      ORDER BY t.updated_at DESC LIMIT 8
    `, [req.user.id, req.user.id]);
  }

  res.json(stats);
});

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── START ────────────────────────────────────────────────────────────────────
initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ TaskFlow running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to init database:', err);
  process.exit(1);
});
