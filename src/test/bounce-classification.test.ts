import { describe, it, expect } from "vitest";

// ─── Replicate classification logic for testing ───────────────────────────────
// (Mirrors the logic in supabase/functions/process-bounces/index.ts)

const HARD_BOUNCE_CODES = new Set(["550", "551", "552", "553", "554", "555", "521", "556"]);
const SOFT_BOUNCE_CODES = new Set(["421", "450", "451", "452", "422"]);

const HARD_BOUNCE_PATTERNS: RegExp[] = [
  /user unknown/i, /no such user/i, /mailbox not found/i, /recipient rejected/i,
  /address rejected/i, /does not exist/i, /invalid (mail)?box/i, /invalid recipient/i,
  /unknown recipient/i, /unknown user/i, /not a valid mailbox/i, /account disabled/i,
  /account has been disabled/i, /account suspended/i, /address does not exist/i,
  /relay not permitted/i, /relay access denied/i, /domain not found/i, /no mx record/i,
  /host not found/i, /undeliverable/i, /permanent failure/i, /rejected for policy reasons/i,
  /blocked.*spamhaus/i, /blocked.*blacklist/i,
  /5\.1\.1/, /5\.1\.2/, /5\.1\.3/, /5\.1\.6/, /5\.7\.1/,
];

const SOFT_BOUNCE_PATTERNS: RegExp[] = [
  /mailbox full/i, /quota exceeded/i, /over quota/i, /insufficient storage/i,
  /too many connections/i, /too many recipients/i, /rate limit/i, /try again later/i,
  /temporarily rejected/i, /temporary.*failure/i, /temporarily deferred/i,
  /service.*unavailable/i, /connection timed out/i, /connection refused/i,
  /greylist/i, /gray.?list/i, /please retry/i,
  /4\.2\.1/, /4\.2\.2/, /4\.7\.1/,
];

const SOFT_BOUNCE_SUPPRESSION_THRESHOLD = 5;

interface BounceClassification {
  type: "hard" | "soft";
  code: string | null;
  reason: string;
  shouldSuppress: boolean;
}

function extractCodeFromText(text: string): string | null {
  const match = text.match(/\b([245]\d{2})\b/);
  return match ? match[1] : null;
}

function classifyBounce(
  responseCode: string | null,
  errorText: string,
  previousSoftBounceCount: number = 0
): BounceClassification {
  const code = responseCode?.trim() || null;

  if (code && HARD_BOUNCE_CODES.has(code)) {
    return { type: "hard", code, reason: errorText || `Permanent failure (${code})`, shouldSuppress: true };
  }
  if (code && SOFT_BOUNCE_CODES.has(code)) {
    const shouldSuppress = previousSoftBounceCount + 1 >= SOFT_BOUNCE_SUPPRESSION_THRESHOLD;
    return { type: "soft", code, reason: errorText || `Temporary failure (${code})`, shouldSuppress };
  }

  for (const pattern of HARD_BOUNCE_PATTERNS) {
    if (pattern.test(errorText)) {
      return { type: "hard", code: code || extractCodeFromText(errorText), reason: errorText, shouldSuppress: true };
    }
  }
  for (const pattern of SOFT_BOUNCE_PATTERNS) {
    if (pattern.test(errorText)) {
      const shouldSuppress = previousSoftBounceCount + 1 >= SOFT_BOUNCE_SUPPRESSION_THRESHOLD;
      return { type: "soft", code: code || extractCodeFromText(errorText), reason: errorText, shouldSuppress };
    }
  }

  const enhancedMatch = errorText.match(/([245])\.\d\.\d/);
  if (enhancedMatch) {
    if (enhancedMatch[1] === "5") return { type: "hard", code: code || extractCodeFromText(errorText), reason: errorText, shouldSuppress: true };
    if (enhancedMatch[1] === "4") {
      const shouldSuppress = previousSoftBounceCount + 1 >= SOFT_BOUNCE_SUPPRESSION_THRESHOLD;
      return { type: "soft", code: code || extractCodeFromText(errorText), reason: errorText, shouldSuppress };
    }
  }

  if (code) {
    if (code.startsWith("5")) return { type: "hard", code, reason: errorText, shouldSuppress: true };
    if (code.startsWith("4")) {
      const shouldSuppress = previousSoftBounceCount + 1 >= SOFT_BOUNCE_SUPPRESSION_THRESHOLD;
      return { type: "soft", code, reason: errorText, shouldSuppress };
    }
  }

  const shouldSuppress = previousSoftBounceCount + 1 >= SOFT_BOUNCE_SUPPRESSION_THRESHOLD;
  return { type: "soft", code: null, reason: errorText || "Unknown bounce reason", shouldSuppress };
}

// ─── DSN Parser ───────────────────────────────────────────────────────────────

function parseDSN(rawMessage: string) {
  const result = {
    statusCode: null as string | null,
    diagnosticCode: null as string | null,
    action: null as string | null,
    recipientAddress: null as string | null,
  };
  const statusMatch = rawMessage.match(/Status:\s*(\d\.\d\.\d)/i);
  if (statusMatch) result.statusCode = statusMatch[1];
  const diagMatch = rawMessage.match(/Diagnostic-Code:\s*smtp;\s*(.+?)(?:\r?\n(?!\s)|$)/is);
  if (diagMatch) result.diagnosticCode = diagMatch[1].trim();
  const actionMatch = rawMessage.match(/Action:\s*(\S+)/i);
  if (actionMatch) result.action = actionMatch[1].toLowerCase();
  const recipientMatch = rawMessage.match(/(?:Final|Original)-Recipient:\s*(?:rfc822;)?\s*(\S+@\S+)/i);
  if (recipientMatch) result.recipientAddress = recipientMatch[1].toLowerCase().replace(/[<>]/g, "");
  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Bounce Classification", () => {
  describe("Hard bounce detection by SMTP code", () => {
    it.each(["550", "551", "552", "553", "554", "555", "521", "556"])(
      "classifies code %s as hard bounce",
      (code) => {
        const result = classifyBounce(code, "Some error");
        expect(result.type).toBe("hard");
        expect(result.shouldSuppress).toBe(true);
      }
    );
  });

  describe("Soft bounce detection by SMTP code", () => {
    it.each(["421", "450", "451", "452", "422"])(
      "classifies code %s as soft bounce",
      (code) => {
        const result = classifyBounce(code, "Temporary error");
        expect(result.type).toBe("soft");
        expect(result.shouldSuppress).toBe(false); // first soft bounce
      }
    );
  });

  describe("Hard bounce detection by error text patterns", () => {
    it.each([
      "550 5.1.1 User unknown",
      "No such user at this domain",
      "Mailbox not found",
      "Recipient rejected",
      "Address does not exist",
      "Account disabled permanently",
      "Account suspended",
      "Relay access denied",
      "Domain not found",
      "Host not found, no MX record",
      "Message undeliverable",
      "Permanent failure delivering to user",
      "5.1.1 The email account does not exist",
      "Blocked by Spamhaus",
      "Rejected for policy reasons",
    ])("classifies '%s' as hard bounce", (errorText) => {
      const result = classifyBounce(null, errorText);
      expect(result.type).toBe("hard");
      expect(result.shouldSuppress).toBe(true);
    });
  });

  describe("Soft bounce detection by error text patterns", () => {
    it.each([
      "Mailbox full, try again later",
      "Quota exceeded for user",
      "Over quota",
      "Insufficient storage",
      "Too many connections from your IP",
      "Rate limit exceeded",
      "Temporarily rejected due to greylisting",
      "Temporary failure, please retry",
      "Service temporarily unavailable",
      "Connection timed out",
      "Connection refused",
      "Greylist in effect",
      "4.2.2 Mailbox full",
      "4.7.1 Please try again later",
    ])("classifies '%s' as soft bounce", (errorText) => {
      const result = classifyBounce(null, errorText);
      expect(result.type).toBe("soft");
    });
  });

  describe("Soft bounce suppression threshold", () => {
    it("does not suppress on first soft bounce", () => {
      const result = classifyBounce("451", "Try again later", 0);
      expect(result.type).toBe("soft");
      expect(result.shouldSuppress).toBe(false);
    });

    it("does not suppress at 3 previous soft bounces", () => {
      const result = classifyBounce("451", "Try again later", 3);
      expect(result.shouldSuppress).toBe(false);
    });

    it("suppresses at threshold (4 previous = 5th bounce)", () => {
      const result = classifyBounce("451", "Try again later", 4);
      expect(result.shouldSuppress).toBe(true);
    });

    it("suppresses above threshold", () => {
      const result = classifyBounce("451", "Try again later", 10);
      expect(result.shouldSuppress).toBe(true);
    });
  });

  describe("Hard bounces always suppress", () => {
    it("suppresses even on first hard bounce", () => {
      const result = classifyBounce("550", "User unknown", 0);
      expect(result.type).toBe("hard");
      expect(result.shouldSuppress).toBe(true);
    });
  });

  describe("Unknown bounce defaults to soft", () => {
    it("classifies unknown error as soft", () => {
      const result = classifyBounce(null, "Some unknown error");
      expect(result.type).toBe("soft");
    });

    it("classifies empty input as soft with no suppress", () => {
      const result = classifyBounce(null, "", 0);
      expect(result.type).toBe("soft");
      expect(result.shouldSuppress).toBe(false);
    });
  });

  describe("Enhanced status codes in error text", () => {
    it("detects 5.x.x as hard bounce", () => {
      const result = classifyBounce(null, "Error 5.4.7 message expired");
      expect(result.type).toBe("hard");
      expect(result.shouldSuppress).toBe(true);
    });

    it("detects 4.x.x as soft bounce", () => {
      const result = classifyBounce(null, "Error 4.4.1 connection timed out");
      expect(result.type).toBe("soft");
    });
  });

  describe("Code extraction from error text", () => {
    it("extracts 3-digit code from text", () => {
      const result = classifyBounce(null, "550 User not found");
      expect(result.code).toBe("550");
    });
  });
});

describe("DSN Parser", () => {
  it("parses a standard DSN message", () => {
    const dsn = `Reporting-MTA: dns; mail.example.com
Final-Recipient: rfc822; user@example.com
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 User unknown`;

    const result = parseDSN(dsn);
    expect(result.statusCode).toBe("5.1.1");
    expect(result.diagnosticCode).toBe("550 5.1.1 User unknown");
    expect(result.action).toBe("failed");
    expect(result.recipientAddress).toBe("user@example.com");
  });

  it("parses DSN with delayed action", () => {
    const dsn = `Final-Recipient: rfc822; admin@test.org
Action: delayed
Status: 4.2.2
Diagnostic-Code: smtp; 452 Mailbox full`;

    const result = parseDSN(dsn);
    expect(result.statusCode).toBe("4.2.2");
    expect(result.action).toBe("delayed");
    expect(result.recipientAddress).toBe("admin@test.org");
  });

  it("handles missing fields gracefully", () => {
    const result = parseDSN("Some random text with no DSN fields");
    expect(result.statusCode).toBeNull();
    expect(result.diagnosticCode).toBeNull();
    expect(result.action).toBeNull();
    expect(result.recipientAddress).toBeNull();
  });

  it("extracts Original-Recipient", () => {
    const dsn = `Original-Recipient: rfc822; bounce@domain.com
Status: 5.1.2`;
    const result = parseDSN(dsn);
    expect(result.recipientAddress).toBe("bounce@domain.com");
  });
});
