import { describe, it, expect } from "vitest";

// ─── Email Job Payload Schema Validation ──────────────────────────────────────
// Mirrors the validation logic used by the send-test-email edge function

interface EmailJobPayload {
  to_address: string;
  from_address: string;
  subject: string;
  html_body?: string | null;
  plain_body?: string | null;
  smtp_server_id?: string | null;
}

interface EmailQueueRecord extends EmailJobPayload {
  user_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

function validateEmailPayload(payload: Partial<EmailJobPayload>): ValidationResult {
  if (!payload.to_address || typeof payload.to_address !== "string" || !payload.to_address.includes("@")) {
    return { valid: false, error: "to_address is required and must be a valid email" };
  }
  if (!payload.from_address || typeof payload.from_address !== "string" || !payload.from_address.includes("@")) {
    return { valid: false, error: "from_address is required and must be a valid email" };
  }
  if (!payload.subject || typeof payload.subject !== "string" || payload.subject.trim().length === 0) {
    return { valid: false, error: "subject is required and must be a non-empty string" };
  }
  return { valid: true };
}

function buildQueueRecord(payload: EmailJobPayload, userId: string): EmailQueueRecord {
  return {
    user_id: userId,
    to_address: payload.to_address,
    from_address: payload.from_address,
    subject: `[TEST] ${payload.subject}`,
    html_body: payload.html_body || null,
    plain_body: payload.plain_body || null,
    smtp_server_id: payload.smtp_server_id || null,
    status: "queued",
    attempts: 0,
    max_attempts: 5,
  };
}

function generateJobId(): string {
  return crypto.randomUUID();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Email API — Payload Schema Validation", () => {
  it("accepts a valid full payload", () => {
    const result = validateEmailPayload({
      to_address: "user@example.com",
      from_address: "sender@example.com",
      subject: "Hello World",
      html_body: "<h1>Hi</h1>",
      plain_body: "Hi",
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("accepts a minimal payload (only required fields)", () => {
    const result = validateEmailPayload({
      to_address: "user@example.com",
      from_address: "sender@example.com",
      subject: "Test",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects missing to_address", () => {
    const result = validateEmailPayload({
      from_address: "sender@example.com",
      subject: "Test",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("to_address");
  });

  it("rejects missing from_address", () => {
    const result = validateEmailPayload({
      to_address: "user@example.com",
      subject: "Test",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("from_address");
  });

  it("rejects missing subject", () => {
    const result = validateEmailPayload({
      to_address: "user@example.com",
      from_address: "sender@example.com",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("subject");
  });

  it("rejects empty subject", () => {
    const result = validateEmailPayload({
      to_address: "user@example.com",
      from_address: "sender@example.com",
      subject: "   ",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("subject");
  });

  it("rejects invalid to_address (no @)", () => {
    const result = validateEmailPayload({
      to_address: "not-an-email",
      from_address: "sender@example.com",
      subject: "Test",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("to_address");
  });

  it("rejects invalid from_address (no @)", () => {
    const result = validateEmailPayload({
      to_address: "user@example.com",
      from_address: "bad-address",
      subject: "Test",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("from_address");
  });

  it("rejects empty payload", () => {
    const result = validateEmailPayload({});
    expect(result.valid).toBe(false);
  });
});

describe("Email API — Enqueue Logic", () => {
  it("builds a queue record with correct defaults", () => {
    const record = buildQueueRecord(
      {
        to_address: "user@example.com",
        from_address: "sender@example.com",
        subject: "Hello",
        html_body: "<p>Hi</p>",
      },
      "user-123"
    );

    expect(record.user_id).toBe("user-123");
    expect(record.to_address).toBe("user@example.com");
    expect(record.from_address).toBe("sender@example.com");
    expect(record.subject).toBe("[TEST] Hello");
    expect(record.html_body).toBe("<p>Hi</p>");
    expect(record.plain_body).toBeNull();
    expect(record.smtp_server_id).toBeNull();
    expect(record.status).toBe("queued");
    expect(record.attempts).toBe(0);
    expect(record.max_attempts).toBe(5);
  });

  it("prefixes subject with [TEST]", () => {
    const record = buildQueueRecord(
      {
        to_address: "a@b.com",
        from_address: "c@d.com",
        subject: "Campaign Launch",
      },
      "u1"
    );
    expect(record.subject).toBe("[TEST] Campaign Launch");
  });

  it("coerces null-ish optional fields to null", () => {
    const record = buildQueueRecord(
      {
        to_address: "a@b.com",
        from_address: "c@d.com",
        subject: "X",
        html_body: undefined,
        plain_body: undefined,
        smtp_server_id: undefined,
      },
      "u1"
    );
    expect(record.html_body).toBeNull();
    expect(record.plain_body).toBeNull();
    expect(record.smtp_server_id).toBeNull();
  });

  it("preserves smtp_server_id when provided", () => {
    const record = buildQueueRecord(
      {
        to_address: "a@b.com",
        from_address: "c@d.com",
        subject: "X",
        smtp_server_id: "server-abc",
      },
      "u1"
    );
    expect(record.smtp_server_id).toBe("server-abc");
  });

  it("preserves both html_body and plain_body", () => {
    const record = buildQueueRecord(
      {
        to_address: "a@b.com",
        from_address: "c@d.com",
        subject: "X",
        html_body: "<b>Bold</b>",
        plain_body: "Bold",
      },
      "u1"
    );
    expect(record.html_body).toBe("<b>Bold</b>");
    expect(record.plain_body).toBe("Bold");
  });
});

describe("Email API — Job ID Return", () => {
  it("returns a valid UUID job ID", () => {
    const id = generateJobId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("returns unique IDs on each call", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateJobId()));
    expect(ids.size).toBe(100);
  });
});
