# Examples

Minimal end-to-end example: a frontend that reports errors, an ingest API that stores them, and Terraform for the production storage. **The front + api pair runs entirely on your machine — no cloud needed.**

```
examples/
├── front/   # Vite app with errmagic integrated
├── api/     # Hono ingest API (saves replays to local disk)
└── infra/   # Terraform for the S3 replay bucket (production)
```

## Run the local loop

```bash
# 1. Start the ingest API (http://localhost:8787)
cd examples/api
pnpm install
pnpm dev

# 2. Start the frontend (http://localhost:5173) in another terminal
cd examples/front
pnpm install
pnpm dev
```

3. Open http://localhost:5173 and click any of the "throw" buttons.
4. The API logs the error and saves the replay to `examples/api/replays/<uuid>.json.gz`.
5. Open `viewer/index.html` (repo root) in a browser and load that `.json.gz` via the file picker — you'll see the replay of what you just did.

## Going to production

- Replace the local-disk storage in `api/src/server.ts` with an S3 `PutObject` (the commented-out snippet shows how).
- `infra/` contains a minimal Terraform setup for the replay bucket. Issue `aws s3 presign` URLs to feed the viewer.
