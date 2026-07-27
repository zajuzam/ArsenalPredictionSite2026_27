/*
 * copy-web.js — copies the web app files into ./www so Capacitor can bundle them.
 * Root files stay the single source of truth; www/ is generated and can be git-ignored.
 * Run with: npm run build:web
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'www');

const FILES = ['index.html', 'app.js', 'config.js', 'styles.css', 'manifest.json', 'sw.js'];
const DIRS  = ['icons'];

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

fs.mkdirSync(dest, { recursive: true });

for (const f of FILES) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dest, f));
  else console.warn('  (skip, not found):', f);
}
for (const dir of DIRS) {
  const src = path.join(root, dir);
  if (fs.existsSync(src)) copyDir(src, path.join(dest, dir));
  else console.warn('  (skip, not found):', dir);
}

console.log('Web files copied to www/');
