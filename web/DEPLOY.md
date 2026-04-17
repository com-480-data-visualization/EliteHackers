# Deployment — Vercel

Deploy via the Vercel CLI (browser auth required — do not run this in CI).

## Steps

1. **Build locally first** (verify it compiles):
   ```bash
   cd web && npm install && npm run build
   ```

2. **First-time setup** (browser will open for authentication):
   ```bash
   npx vercel
   ```
   - Framework: Vite
   - Output directory: `dist`
   - Build command: `npm run build`
   - Install command: `npm install`

3. **Production deploy**:
   ```bash
   npx vercel --prod
   ```
   Or use the npm script:
   ```bash
   npm run deploy
   ```

## Notes

- All data files are pre-committed to `public/data/` — no build-time data fetching needed.
- Every `fetch()` in the source uses relative paths (`/data/...`) so Vercel preview URLs work automatically.
- The Vite config sets `publicDir: 'public'` — contents are copied to `dist/` verbatim.
