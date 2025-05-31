const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const zlib = require('zlib');

const app = express();
const PORT = 3000;

// Ensure folders exist
const STORAGE_DIR = path.join(__dirname, 'storage');
const PUBLIC_DIR = path.join(__dirname, 'public');
fs.ensureDirSync(STORAGE_DIR);
fs.ensureDirSync(PUBLIC_DIR);

// Middleware
app.use(express.static('frontend'));
app.use('/public', express.static(PUBLIC_DIR));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🔳 Home with warning
app.get('/', (req, res) => {
  res.send(`
    <html style="background:#111;color:#eee;font-family:sans-serif">
      <body>
        <h1>Glitchly</h1>
        <p>Please don’t make too many web apps — the server only has so much disk space!</p>
        <p>Go to /edit/appname to create one, or /appname to run one.</p>
      </body>
    </html>
  `);
});

// 📝 Edit page
app.get('/edit/:name', async (req, res) => {
  const appDir = path.join(PUBLIC_DIR, req.params.name);
  await fs.ensureDir(appDir);
  const indexFile = path.join(appDir, 'index.html');

  if (!(await fs.pathExists(indexFile))) {
    await fs.writeFile(indexFile, `<html><body><h1>Hello from ${req.params.name}!</h1></body></html>`);
  }

  const html = await fs.readFile(indexFile, 'utf8');

  res.send(`
    <html style="background:#111;color:#eee;font-family:sans-serif">
      <body>
        <h2>Editing: ${req.params.name}</h2>
        <form method="POST">
          <textarea name="code" style="width:100%;height:300px">${html}</textarea><br>
          <button type="submit">Save</button>
        </form>
      </body>
    </html>
  `);
});

// 💾 Save edited app
app.post('/edit/:name', async (req, res) => {
  const appDir = path.join(PUBLIC_DIR, req.params.name);
  await fs.ensureDir(appDir);
  const indexFile = path.join(appDir, 'index.html');

  await fs.writeFile(indexFile, req.body.code || '');
  await compressApp(req.params.name);
  res.redirect(`/edit/${req.params.name}`);
});

// ▶️ Use the app
app.get('/:name', async (req, res) => {
  const appDir = path.join(PUBLIC_DIR, req.params.name);
  const compressed = path.join(STORAGE_DIR, `${req.params.name}.gz`);

  // Decompress if not present
  if (!(await fs.pathExists(appDir))) {
    if (!(await fs.pathExists(compressed))) {
      return res.status(404).send("App not found.");
    }
    await decompressApp(req.params.name);
  }

  const indexFile = path.join(appDir, 'index.html');
  if (!(await fs.pathExists(indexFile))) {
    return res.status(404).send("App has no index.html.");
  }

  res.sendFile(indexFile);
});

// 📦 Compression function
async function compressApp(appName) {
  const srcDir = path.join(PUBLIC_DIR, appName);
  const output = fs.createWriteStream(path.join(STORAGE_DIR, `${appName}.gz`));
  const archive = zlib.createGzip();

  const input = fs.createReadStream(path.join(srcDir, 'index.html'));
  input.pipe(archive).pipe(output);

  // Optionally clear from public after compression (space saver)
  setTimeout(() => {
    fs.remove(srcDir);
  }, 5000);
}

// 🔓 Decompression function
async function decompressApp(appName) {
  const appDir = path.join(PUBLIC_DIR, appName);
  const input = fs.createReadStream(path.join(STORAGE_DIR, `${appName}.gz`));
  const output = fs.createWriteStream(path.join(appDir, 'index.html'));

  await fs.ensureDir(appDir);
  input.pipe(zlib.createGunzip()).pipe(output);
}

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Glitchly running at http://localhost:${PORT}`);
});
