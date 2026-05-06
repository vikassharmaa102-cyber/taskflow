
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Fake DB init function
async function initDb() {
  console.log('✅ Database initialized');
}

// Health route
app.get('/health', (req, res) => {
  res.send('Server working');
});

// Example API route
app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'API working' });
});

// Serve frontend
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Start server
const PORT = process.env.PORT || 8080;

initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ TaskFlow running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to init database:', err);
    process.exit(1);
  });
```

After pasting:

1. Save `server.js`
2. Commit changes on GitHub
3. Wait for Railway redeploy
4. Open:

```txt
https://YOUR-DOMAIN.up.railway.app/health
```

You should see:

```txt
Server working
```


