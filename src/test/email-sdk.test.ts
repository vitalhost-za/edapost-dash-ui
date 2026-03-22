import { describe, it, expect } from "vitest";

// ─── Inline CSS Tests ─────────────────────────────────────────────────────────

import { inlineCSS } from "@/lib/inline-css";

describe("Inline CSS", () => {
  it("inlines a simple tag selector", () => {
    const html = `<style>p { color: red; }</style><p>Hello</p>`;
    const result = inlineCSS(html);
    expect(result).toContain('style="color: red"');
    expect(result).not.toContain("<style>");
  });

  it("inlines a class selector", () => {
    const html = `<style>.intro { font-weight: bold; }</style><p class="intro">Hi</p>`;
    const result = inlineCSS(html);
    expect(result).toContain('style="font-weight: bold"');
  });

  it("inlines an id selector", () => {
    const html = `<style>#header { background: blue; }</style><div id="header">Header</div>`;
    const result = inlineCSS(html);
    expect(result).toContain('style="background: blue"');
  });

  it("preserves existing inline styles", () => {
    const html = `<style>p { color: red; }</style><p style="margin: 0">Hello</p>`;
    const result = inlineCSS(html);
    expect(result).toContain("color: red");
    expect(result).toContain("margin: 0");
  });

  it("handles multiple rules on same element", () => {
    const html = `<style>p { color: red; } .bold { font-weight: bold; }</style><p class="bold">Hi</p>`;
    const result = inlineCSS(html);
    expect(result).toContain("color: red");
    expect(result).toContain("font-weight: bold");
  });

  it("returns original html if no style blocks", () => {
    const html = `<p>Hello</p>`;
    expect(inlineCSS(html)).toBe(html);
  });

  it("handles comma-separated selectors", () => {
    const html = `<style>h1, h2 { color: navy; }</style><h1>A</h1><h2>B</h2><p>C</p>`;
    const result = inlineCSS(html);
    expect(result).toContain('<h1 style="color: navy">');
    expect(result).toContain('<h2 style="color: navy">');
    expect(result).not.toContain('<p style=');
  });
});

// ─── SDK Validation Tests ─────────────────────────────────────────────────────

describe("Email SDK — Payload Validation", () => {
  function validatePayload(opts: {
    to?: string;
    from?: string;
    subject?: string;
    html?: string | null;
    text?: string | null;
  }): string | null {
    if (!opts.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(opts.to)) return "Invalid or missing 'to' address";
    if (!opts.from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(opts.from)) return "Invalid or missing 'from' address";
    if (!opts.subject || opts.subject.trim().length === 0) return "Subject is required";
    if (!opts.html && !opts.text) return "Either html or text body is required";
    return null;
  }

  it("accepts a valid payload", () => {
    expect(validatePayload({ to: "a@b.com", from: "c@d.com", subject: "Hi", html: "<p>Hi</p>" })).toBeNull();
  });

  it("rejects missing to", () => {
    expect(validatePayload({ from: "c@d.com", subject: "Hi", html: "<p>Hi</p>" })).toContain("to");
  });

  it("rejects missing from", () => {
    expect(validatePayload({ to: "a@b.com", subject: "Hi", html: "<p>Hi</p>" })).toContain("from");
  });

  it("rejects missing subject", () => {
    expect(validatePayload({ to: "a@b.com", from: "c@d.com", html: "<p>Hi</p>" })).toContain("Subject");
  });

  it("rejects missing body", () => {
    expect(validatePayload({ to: "a@b.com", from: "c@d.com", subject: "Hi" })).toContain("body");
  });

  it("accepts text-only body", () => {
    expect(validatePayload({ to: "a@b.com", from: "c@d.com", subject: "Hi", text: "Hello" })).toBeNull();
  });
});

// ─── Unsubscribe URL generation ───────────────────────────────────────────────

describe("List-Unsubscribe header generation", () => {
  function buildUnsubscribeHeaders(baseUrl: string, email: string, userId: string, listId?: string) {
    const params = new URLSearchParams({ email, uid: userId });
    if (listId) params.set("list", listId);
    const url = `${baseUrl}/functions/v1/process-unsubscribe?${params}`;
    return {
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
  }

  it("generates correct List-Unsubscribe header", () => {
    const headers = buildUnsubscribeHeaders("https://example.supabase.co", "test@example.com", "uid-123");
    expect(headers["List-Unsubscribe"]).toContain("process-unsubscribe");
    expect(headers["List-Unsubscribe"]).toContain("email=test%40example.com");
    expect(headers["List-Unsubscribe"]).toContain("uid=uid-123");
  });

  it("includes list_id when provided", () => {
    const headers = buildUnsubscribeHeaders("https://example.supabase.co", "test@example.com", "uid-123", "list-456");
    expect(headers["List-Unsubscribe"]).toContain("list=list-456");
  });

  it("always includes List-Unsubscribe-Post for RFC 8058", () => {
    const headers = buildUnsubscribeHeaders("https://x.co", "a@b.com", "u1");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
