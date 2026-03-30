require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const Redis = require("ioredis");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ── Connections ──────────────────────────────────────────────────────────────

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
});

// ── Auth middleware ──────────────────────────────────────────────────────────

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }
  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
    req.userId = decoded.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ── Health check ─────────────────────────────────────────────────────────────

app.get("/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    await redis.ping();
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: "error", error: err.message });
  }
});

// ── POST /api/send ── Queue an email for delivery ───────────────────────────

app.post("/api/send", authenticate, async (req, res) => {
  const { to_address, from_address, subject, html_body, plain_body, smtp_server_id, headers } = req.body;

  if (!to_address || !from_address || !subject) {
    return res.status(400).json({ error: "to_address, from_address, and subject are required" });
  }

  if (!to_address.includes("@")) {
    return res.status(400).json({ error: "to_address must be a valid email" });
  }

  try {
    const id = uuidv4();
    await db.query(
      `INSERT INTO email_queue (id, user_id, to_address, from_address, subject, html_body, plain_body, smtp_server_id, status, attempts, max_attempts, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', 0, 5, NOW())`,
      [id, req.userId, to_address, from_address, subject, html_body || null, plain_body || null, smtp_server_id || null]
    );

    // Notify worker via Redis pub/sub
    await redis.publish("edapost:new-email", JSON.stringify({ id, to_address }));

    res.status(201).json({ id, status: "queued", message: `Email queued for ${to_address}` });
  } catch (err) {
    console.error("Queue insert error:", err);
    res.status(500).json({ error: "Failed to queue email" });
  }
});

// ── POST /api/send-test ── Queue a test email ───────────────────────────────

app.post("/api/send-test", authenticate, async (req, res) => {
  const { to_address, from_address, subject, html_body, plain_body, smtp_server_id } = req.body;

  if (!to_address || !from_address || !subject) {
    return res.status(400).json({ error: "to_address, from_address, and subject are required" });
  }

  try {
    const id = uuidv4();
    await db.query(
      `INSERT INTO email_queue (id, user_id, to_address, from_address, subject, html_body, plain_body, smtp_server_id, status, attempts, max_attempts, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', 0, 5, NOW())`,
      [id, req.userId, to_address, from_address, `[TEST] ${subject}`, html_body || null, plain_body || null, smtp_server_id || null]
    );

    await redis.publish("edapost:new-email", JSON.stringify({ id, to_address }));

    res.status(201).json({ id, status: "queued", message: `Test email queued for ${to_address}` });
  } catch (err) {
    console.error("Test email error:", err);
    res.status(500).json({ error: "Failed to queue test email" });
  }
});

// ── POST /api/send-batch ── Queue multiple emails ───────────────────────────

app.post("/api/send-batch", authenticate, async (req, res) => {
  const { emails } = req.body;

  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: "emails array is required" });
  }
  if (emails.length > 1000) {
    return res.status(400).json({ error: "Maximum 1000 emails per batch" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const ids = [];
    for (const email of emails) {
      if (!email.to_address || !email.from_address || !email.subject) continue;
      const id = uuidv4();
      await client.query(
        `INSERT INTO email_queue (id, user_id, to_address, from_address, subject, html_body, plain_body, smtp_server_id, status, attempts, max_attempts, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', 0, 5, NOW())`,
        [id, req.userId, email.to_address, email.from_address, email.subject, email.html_body || null, email.plain_body || null, email.smtp_server_id || null]
      );
      ids.push(id);
    }

    await client.query("COMMIT");
    await redis.publish("edapost:new-email", JSON.stringify({ count: ids.length }));

    res.status(201).json({ queued: ids.length, ids });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Batch insert error:", err);
    res.status(500).json({ error: "Failed to queue batch" });
  } finally {
    client.release();
  }
});

// ── GET /api/status/:id ── Check email delivery status ──────────────────────

app.get("/api/status/:id", authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, status, attempts, error_message, sent_at, created_at
       FROM email_queue WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Email not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

// ── GET /api/queue/stats ── Queue statistics ────────────────────────────────

app.get("/api/queue/stats", authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT status, COUNT(*) as count
       FROM email_queue WHERE user_id = $1
       GROUP BY status`,
      [req.userId]
    );
    const stats = {};
    for (const row of rows) stats[row.status] = parseInt(row.count);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ── Start server ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.API_PORT || "3001");
const HOST = process.env.API_HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`EdaPost Email API listening on ${HOST}:${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Shutting down API...");
  await db.end();
  redis.disconnect();
  process.exit(0);
});
