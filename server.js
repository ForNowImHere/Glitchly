const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const zlib = require('zlib');

const app = express();
const PORT = 3000;

const STORAGE_DIR = path.join(__dirname, 'storage');
const PUBLIC_DIR = path.join(__dirname, 'public');

fs.ensureDirSync(STORAGE_DIR);
fs.ensureDirSync(PUBLIC_DIR);

app.use(express.static('frontend'));
app.use('/public', express.static(PUBLIC_DIR));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🚨 Recover all apps from storage on boot
(async () => {
  const files = await fs.readdir(STORAGE_DIR);
  for (const file of files) {
    if (file.endsWith('.gz')) {
      const appName = path.basename(file, '.gz');
      const appDir = path.join(PUBLIC_DIR, appName);
      if (!(await fs.pathExists(appDir))) {
        try {
          await decompressApp(appName);
        } catch (err) {
          console.error(`❌ Failed to decompress ${appName}:`, err.message);
        }
      }
    }
  }
})();

// 🔳 Home with warning
app.get('/', (req, res) => {
  res.send(`
    <html style="background:#111;color:#eee;font-family:sans-serif">
      <body>
        <h1>Glitchly</h1>
        <p>Don’t overload the server! Save space wisely.</p>
        <p>Visit /edit/appname to edit, or /appname to view.</p>
      </body>
    </html>
  `);
});

// 📝 Edit page
app.get('/edit/:name', async (req, res) => {
  const appDir = path.join(PUBLIC_DIR, req.params.name);
  const indexFile = path.join(appDir, 'index.html');

  try {
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
            <textarea name="code" style="width:100%;height:300px">${html}</textarea><br>
            <button type="submit">Save</button>
          </form>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`Error loading editor: ${err.message}`);
  }
});

// 💾 Save edited app
app.post('/edit/:name', async (req, res) => {
  const appDir = path.join(PUBLIC_DIR, req.params.name);
  const indexFile = path.join(appDir, 'index.html');

  try {
    await fs.ensureDir(appDir);
    await fs.writeFile(indexFile, req.body.code || '');
    await compressApp(req.params.name);
    res.redirect(`/edit/${req.params.name}`);
  } catch (err) {
    res.status(500).send(`Error saving: ${err.message}`);
  }
});

// ▶️ Serve app
app.get('/:name', async (req, res) => {
  const appDir = path.join(PUBLIC_DIR, req.params.name);
  const indexFile = path.join(appDir, 'index.html');
  const compressed = path.join(STORAGE_DIR, `${req.params.name}.gz`);

  try {
    if (!(await fs.pathExists(appDir))) {
      if (!(await fs.pathExists(compressed))) {
        return res.status(404).send("App not found.");
      }
      await decompressApp(req.params.name);
    }

    if (!(await fs.pathExists(indexFile))) {
      return res.status(404).send("App missing index.html.");
    }

    res.sendFile(indexFile);
  } catch (err) {
    res.status(500).send(`Error loading app: ${err.message}`);
  }
});

// 📦 Compress
async function compressApp(appName) {
  const src = path.join(PUBLIC_DIR, appName, 'index.html');
  const dest = path.join(STORAGE_DIR, `${appName}.gz`);

  return new Promise((resolve, reject) => {
    const gzip = zlib.createGzip();
    const input = fs.createReadStream(src);
    const output = fs.createWriteStream(dest);

    input.pipe(gzip).pipe(output);

    output.on('finish', async () => {
      try {
        // Wait a bit to ensure gzip is closed
        await new Promise(r => setTimeout(r, 500));
        await fs.remove(path.join(PUBLIC_DIR, appName)); // remove after compress
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    output.on('error', reject);
  });
}

// 🔓 Decompress
async function decompressApp(appName) {
  const src = path.join(STORAGE_DIR, `${appName}.gz`);
  const destDir = path.join(PUBLIC_DIR, appName);
  const tempFile = path.join(destDir, 'index_temp.html');
  const finalFile = path.join(destDir, 'index.html');

  await fs.ensureDir(destDir);

  return new Promise((resolve, reject) => {
    const gunzip = zlib.createGunzip();
    const input = fs.createReadStream(src);
    const output = fs.createWriteStream(tempFile);

    input.pipe(gunzip).pipe(output);

    output.on('finish', async () => {
      try {
        await fs.move(tempFile, finalFile, { overwrite: true });
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    output.on('error', reject);
  });
}

app.listen(PORT, () => {
  console.log(`🌐 Glitchly running at http://localhost:${PORT}`);
});
