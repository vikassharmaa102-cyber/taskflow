const express = require('express');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 8080;

// Health route
app.get('/health', (req, res) => {
  res.send('Server working');
});

// Home route
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>TaskFlow</title>
      </head>
      <body style="font-family: Arial; text-align:center; padding-top:50px;">
        <h1>✅ TaskFlow is Live</h1>
        <p>Railway deployment successful</p>
      </body>
    </html>
  `);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ TaskFlow running on port ${PORT}`);
});

