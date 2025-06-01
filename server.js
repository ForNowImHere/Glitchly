const express = require('express');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = 3000;

const PUBLIC_DIR = path.join(__dirname, 'public');
fs.ensureDirSync(PUBLIC_DIR);

app.use(express.static('frontend'));
app.use('/public', express.static(PUBLIC_DIR));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🏠 Home page with WebP hate
app.get('/', (req, res) => {
  res.send(`
    <html style="background:#111;color:#eee;font-family:sans-serif">
      <body>
        <h1>Glitchly</h1>
        <p>⚠️ WEBPs are <strong>HATED</strong> around here. Use <strong>PNGs</strong> like the old gods intended.</p>
        <p>Create your app at <code>/edit/appname</code> or run it at <code>/appname</code>.</p>
      </body>
    </html>
  `);
});

// 📝 Edit an app
app.get('/edit/:name', async (req, res) => {
  const appDir = path.join(PUBLIC_DIR, req.params.name);
  const indexFile = path.join(appDir, 'index.html');

  await fs.ensureDir(appDir);

  if (!(await fs.pathExists(indexFile))) {
    await fs.writeFile(indexFile, `<html><body><h1>Hello from ${req.params.name}!</h1></body></html>`);
  }

  const html = await fs.readFile(indexFile, 'utf8');

  res.send(`
    <html style="background:#111;color:#eee;font-family:sans-serif">
      <body>
        <h2>Editing: ${req.params.name}</h2>
        <form method="POST">
          <textarea name="code" style="width:100%;height:300px">${html.replace(/</g, "&lt;")}</textarea><br>
          <button type="submit">Save</button>
        </form>
        <p><a href="/${req.params.name}" style="color:lime">▶️ View App</a></p>
      </body>
    </html>
  `);
});

// 💾 Save the edited HTML
app.post('/edit/:name', async (req, res) => {
  const appDir = path.join(PUBLIC_DIR, req.params.name);
  const indexFile = path.join(appDir, 'index.html');
  const html = req.body.code || '';

  await fs.ensureDir(appDir);
  await fs.writeFile(indexFile, html);

  res.redirect(`/edit/${req.params.name}`);
});

// ▶️ Serve the app
app.get('/:name', async (req, res) => {
  const indexFile = path.join(PUBLIC_DIR, req.params.name, 'index.html');

  if (!(await fs.pathExists(indexFile))) {
    return res.status(404).send("❌ App not found.");
  }

  res.sendFile(indexFile);
});

app.listen(PORT, () => {
  console.log(`🌐 Glitchly running at http://localhost:${PORT}`);
});
