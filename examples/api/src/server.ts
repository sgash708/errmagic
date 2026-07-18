import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const EXPECTED_APP = process.env.EXPECTED_APP ?? "my-app";
const REPLAY_DIR = path.resolve(import.meta.dirname, "../replays");

interface ErrorReport {
  app: string;
  name: string;
  message: string;
  stack: string | null;
  url: string;
  user_agent: string;
  occurred_at: string;
  replay: string | null;
  replay_format: string | null;
}

const app = new Hono();

// The frontend runs on a different origin (localhost:5173), so allow CORS.
app.use("/errors", cors());

app.post("/errors", async (c) => {
  const report = await c.req.json<ErrorReport>();

  // 1. Validate — reject payloads from unknown apps
  if (report.app !== EXPECTED_APP) return c.body(null, 400);

  // 2. Store the replay. base64-decoding yields gzip bytes as-is:
  //    write them WITHOUT decompressing, as .json.gz (the viewer's format).
  let replayKey: string | null = null;
  if (report.replay) {
    replayKey = `${randomUUID()}.json.gz`;
    await mkdir(REPLAY_DIR, { recursive: true });
    await writeFile(path.join(REPLAY_DIR, replayKey), Buffer.from(report.replay, "base64"));
    // In production, put the same bytes to object storage instead:
    // await s3.send(new PutObjectCommand({
    //   Bucket: process.env.REPLAY_BUCKET,
    //   Key: `${report.app}/${replayKey}`,
    //   Body: Buffer.from(report.replay, "base64"),
    //   ContentType: "application/gzip",
    // }));
  }

  // 3. Persist / notify the error itself (here: just log it)
  console.log(`[${report.occurred_at}] ${report.name}: ${report.message}`);
  console.log(`  url: ${report.url}`);
  if (replayKey) console.log(`  replay: replays/${replayKey}`);

  // 4. The client never reads the response — 204 is enough
  return c.body(null, 204);
});

serve({ fetch: app.fetch, port: 8787 }, () => {
  console.log("errmagic example API listening on http://localhost:8787");
});
