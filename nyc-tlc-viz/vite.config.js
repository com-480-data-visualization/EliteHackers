import { defineConfig } from 'vite';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Absolute path to the pipeline's data directory (one level up from nyc-tlc-viz/)
const PIPELINE_DATA_ROOT = resolve(__dirname, '../nyc-tlc-pipeline/data');

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 3000,
    open: true,
  },
  plugins: [
    {
      name: 'serve-pipeline-data',
      configureServer(server) {
        // Intercept any request to /nyc-tlc-pipeline/data/... and serve
        // from the actual filesystem location outside the Vite root.
        server.middlewares.use((req, res, next) => {
          const PREFIX = '/nyc-tlc-pipeline/data/';
          const url = (req.url ?? '').split('?')[0];
          if (!url.startsWith(PREFIX)) return next();

          const relPath = url.slice(PREFIX.length);
          const filePath = join(PIPELINE_DATA_ROOT, relPath);

          // Guard against path traversal
          if (!filePath.startsWith(PIPELINE_DATA_ROOT)) return next();

          if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            return next();
          }

          const ext = filePath.split('.').pop()?.toLowerCase();
          const CONTENT_TYPES = {
            json: 'application/json',
            geojson: 'application/json',
            csv: 'text/csv; charset=utf-8',
          };
          res.setHeader('Content-Type', CONTENT_TYPES[ext] ?? 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');
          fs.createReadStream(filePath).pipe(res);
        });
      },
    },
  ],
  build: {
    outDir: 'dist',
  },
});
