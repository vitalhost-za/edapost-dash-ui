import { describe, it, expect } from "vitest";

// ─── Replicate ARF parser for testing ─────────────────────────────────────────

interface ARFReport {
  feedbackType: string | null;
  userAgent: string | null;
  version: string | null;
  originalMailFrom: string | null;
  originalRcptTo: string | null;
  reportedDomain: string | null;
  sourceIp: string | null;
  authenticationResults: string | null;
  reportedUri: string[];
  removalRecipient: string | null;
  originalFrom: string | null;
  originalTo: string | null;
  originalSubject: string | null;
  originalMessageId: string | null;
}

function extractEmail(value: string): string {
  const angleMatch = value.match(/<([^>]+@[^>]+)>/);
  if (angleMatch) return angleMatch[1].toLowerCase();
  const bareMatch = value.match(/(\S+@\S+)/);
  if (bareMatch) return bareMatch[1].toLowerCase();
  return value.toLowerCase();
}

function parseARF(rawMessage: string): ARFReport {
  const report: ARFReport = {
    feedbackType: null, userAgent: null, version: null,
    originalMailFrom: null, originalRcptTo: null, reportedDomain: null,
    sourceIp: null, authenticationResults: null, reportedUri: [],
    removalRecipient: null, originalFrom: null, originalTo: null,
    originalSubject: null, originalMessageId: null,
  };

  const feedbackTypeMatch = rawMessage.match(/Feedback-Type:\s*(.+)/i);
  if (feedbackTypeMatch) report.feedbackType = feedbackTypeMatch[1].trim();

  const userAgentMatch = rawMessage.match(/User-Agent:\s*(.+)/i);
  if (userAgentMatch) report.userAgent = userAgentMatch[1].trim();

  const versionMatch = rawMessage.match(/Version:\s*(.+)/i);
  if (versionMatch) report.version = versionMatch[1].trim();

  const mailFromMatch = rawMessage.match(/Original-Mail-From:\s*(.+)/i);
  if (mailFromMatch) report.originalMailFrom = extractEmail(mailFromMatch[1].trim());

  const rcptToMatch = rawMessage.match(/Original-Rcpt-To:\s*(.+)/i);
  if (rcptToMatch) report.originalRcptTo = extractEmail(rcptToMatch[1].trim());

  const reportedDomainMatch = rawMessage.match(/Reported-Domain:\s*(.+)/i);
  if (reportedDomainMatch) report.reportedDomain = reportedDomainMatch[1].trim();

  const sourceIpMatch = rawMessage.match(/Source-IP:\s*(.+)/i);
  if (sourceIpMatch) report.sourceIp = sourceIpMatch[1].trim();

  const authResultsMatch = rawMessage.match(/Authentication-Results:\s*(.+)/i);
  if (authResultsMatch) report.authenticationResults = authResultsMatch[1].trim();

  const uriMatches = rawMessage.matchAll(/Reported-URI:\s*(.+)/gi);
  for (const m of uriMatches) {
    report.reportedUri.push(m[1].trim());
  }

  const removalMatch = rawMessage.match(/Removal-Recipient:\s*(.+)/i);
  if (removalMatch) report.removalRecipient = extractEmail(removalMatch[1].trim());

  const fromMatch = rawMessage.match(/^From:\s*(.+)/im);
  if (fromMatch) report.originalFrom = extractEmail(fromMatch[1].trim());

  const toMatch = rawMessage.match(/^To:\s*(.+)/im);
  if (toMatch) report.originalTo = extractEmail(toMatch[1].trim());

  const subjectMatch = rawMessage.match(/^Subject:\s*(.+)/im);
  if (subjectMatch) report.originalSubject = subjectMatch[1].trim();

  const messageIdMatch = rawMessage.match(/^Message-ID:\s*(.+)/im);
  if (messageIdMatch) report.originalMessageId = messageIdMatch[1].trim().replace(/[<>]/g, "");

  return report;
}

function getComplainantEmail(report: ARFReport): string | null {
  return report.originalRcptTo || report.removalRecipient || report.originalTo || null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ARF Report Parser", () => {
  it("parses a standard ARF abuse report", () => {
    const arf = `Feedback-Type: abuse
User-Agent: FBL/1.0
Version: 1
Original-Mail-From: sender@example.com
Original-Rcpt-To: victim@recipient.com
Reported-Domain: example.com
Source-IP: 192.168.1.100
Authentication-Results: mail.recipient.com; spf=pass`;

    const result = parseARF(arf);
    expect(result.feedbackType).toBe("abuse");
    expect(result.userAgent).toBe("FBL/1.0");
    expect(result.version).toBe("1");
    expect(result.originalMailFrom).toBe("sender@example.com");
    expect(result.originalRcptTo).toBe("victim@recipient.com");
    expect(result.reportedDomain).toBe("example.com");
    expect(result.sourceIp).toBe("192.168.1.100");
    expect(result.authenticationResults).toBe("mail.recipient.com; spf=pass");
  });

  it("parses email addresses with angle brackets", () => {
    const arf = `Original-Mail-From: <SENDER@Example.COM>
Original-Rcpt-To: <user@domain.org>`;

    const result = parseARF(arf);
    expect(result.originalMailFrom).toBe("sender@example.com");
    expect(result.originalRcptTo).toBe("user@domain.org");
  });

  it("extracts original message headers", () => {
    const arf = `Feedback-Type: abuse
Version: 1

From: Marketing <marketing@sender.com>
To: user@victim.com
Subject: Buy now!
Message-ID: <abc123@sender.com>`;

    const result = parseARF(arf);
    expect(result.originalFrom).toBe("marketing@sender.com");
    expect(result.originalTo).toBe("user@victim.com");
    expect(result.originalSubject).toBe("Buy now!");
    expect(result.originalMessageId).toBe("abc123@sender.com");
  });

  it("handles multiple Reported-URI fields", () => {
    const arf = `Feedback-Type: abuse
Reported-URI: http://spam.example.com/offer
Reported-URI: http://spam.example.com/unsubscribe`;

    const result = parseARF(arf);
    expect(result.reportedUri).toHaveLength(2);
    expect(result.reportedUri[0]).toBe("http://spam.example.com/offer");
  });

  it("parses opt-out feedback type with Removal-Recipient", () => {
    const arf = `Feedback-Type: opt-out
Removal-Recipient: unsubscribe@lists.example.com`;

    const result = parseARF(arf);
    expect(result.feedbackType).toBe("opt-out");
    expect(result.removalRecipient).toBe("unsubscribe@lists.example.com");
  });

  it("handles empty/minimal input gracefully", () => {
    const result = parseARF("Some random text");
    expect(result.feedbackType).toBeNull();
    expect(result.originalRcptTo).toBeNull();
    expect(result.reportedUri).toEqual([]);
  });
});

describe("Complainant Email Extraction", () => {
  it("prefers Original-Rcpt-To", () => {
    const report = parseARF(`Original-Rcpt-To: rcpt@a.com
Removal-Recipient: removal@b.com
To: to@c.com`);
    expect(getComplainantEmail(report)).toBe("rcpt@a.com");
  });

  it("falls back to Removal-Recipient", () => {
    const report = parseARF(`Removal-Recipient: removal@b.com
To: to@c.com`);
    expect(getComplainantEmail(report)).toBe("removal@b.com");
  });

  it("falls back to To header", () => {
    const report = parseARF(`To: to@c.com`);
    expect(getComplainantEmail(report)).toBe("to@c.com");
  });

  it("returns null when no email found", () => {
    const report = parseARF("Feedback-Type: abuse");
    expect(getComplainantEmail(report)).toBeNull();
  });
});
