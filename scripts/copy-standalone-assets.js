// Next.js "standalone" output (.next/standalone/server.js) does not include the
// static client assets or the public/ folder - the docs expect the deployer to
// place them alongside server.js. The Dockerfile does this with its own COPY
// layers; this script does the same thing so `.next/standalone` is a complete,
// runnable server on its own, which is what both `electron/main.js` (dev smoke
// test) and electron-builder's extraResources package expect.

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const standalone = path.join(root, '.next', 'standalone');

if (!fs.existsSync(standalone)) {
  console.error('.next/standalone not found - run "next build" first');
  process.exit(1);
}

fs.cpSync(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), {
  recursive: true,
});
fs.cpSync(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });

console.log('Copied .next/static and public/ into .next/standalone');
