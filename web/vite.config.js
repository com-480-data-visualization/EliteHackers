import { defineConfig } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LANDING, PAGE_FILES } from './src/siteConfig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Single source of truth for which HTML file `/` serves — derived from
// `LANDING`. Used by:
//   • the dev-server middleware below to redirect `/` in `vite dev`
//   • the `landingRouter` plugin below to (re)write `vercel.json` at build
//     start so the production deployment routes `/` the same way
const landingFile = PAGE_FILES[LANDING];
if (!landingFile) {
  throw new Error(
    `[siteConfig] LANDING="${LANDING}" is invalid — must be one of: ${Object.keys(PAGE_FILES).join(', ')}`,
  );
}

function writeVercelRewrites() {
  // Vercel reads vercel.json from the project root (here: web/) at deploy
  // time. Regenerating it on every dev start / build keeps it in sync with
  // the JS `LANDING` constant — so flipping LANDING + rebuilding (or just
  // restarting dev) is the only step needed to flip the live site.
  const config = {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    rewrites: [
      { source: '/', destination: `/${landingFile}` },
    ],
  };
  const outPath = resolve(__dirname, 'vercel.json');
  writeFileSync(outPath, JSON.stringify(config, null, 2) + '\n');
}

function landingRouter() {
  return {
    name: 'landing-router',
    configResolved() {
      // Keep vercel.json in sync from a single place — runs in dev and build.
      writeVercelRewrites();
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Strip query/hash before matching so e.g. `/?foo=1` still redirects.
        const url = req.url || '/';
        const pathOnly = url.split('?')[0].split('#')[0];
        if (pathOnly === '/' || pathOnly === '') {
          res.writeHead(302, { Location: '/' + landingFile });
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [landingRouter()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        story: resolve(__dirname, 'story.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
      },
    },
  },
  server: {
    port: 3001,
    open: '/' + landingFile,
  },
});
