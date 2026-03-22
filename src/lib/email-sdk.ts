/**
 * EdaPost Internal Email Sending SDK
 *
 * Usage:
 *   import { edapostEmail } from "@/lib/email-sdk";
 *   const result = await edapostEmail.send({ to, from, subject, html });
 */

import { supabase } from "@/integrations/supabase/client";

export interface SendEmailOptions {
  to: string;
  from: string;
  subject: string;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
  smtpServerId?: string | null;
}

export interface SendEmailResult {
  success: boolean;
  jobId?: string;
  error?: string;
}

export interface EmailStatus {
  id: string;
  status: string;
  to: string;
  from: string;
  subject: string;
  sentAt: string | null;
  error: string | null;
  attempts: number;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePayload(opts: SendEmailOptions): string | null {
  if (!opts.to || !validateEmail(opts.to)) return "Invalid or missing 'to' address";
  if (!opts.from || !validateEmail(opts.from)) return "Invalid or missing 'from' address";
  if (!opts.subject || opts.subject.trim().length === 0) return "Subject is required";
  if (!opts.html && !opts.text) return "Either html or text body is required";
  return null;
}

async function send(opts: SendEmailOptions): Promise<SendEmailResult> {
  const error = validatePayload(opts);
  if (error) return { success: false, error };

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { success: false, error: "Not authenticated" };

  const { data, error: insertError } = await supabase
    .from("email_queue")
    .insert({
      user_id: userData.user.id,
      to_address: opts.to,
      from_address: opts.from,
      subject: opts.subject,
      html_body: opts.html || null,
      plain_body: opts.text || null,
      smtp_server_id: opts.smtpServerId || null,
    })
    .select("id")
    .single();

  if (insertError) return { success: false, error: insertError.message };
  return { success: true, jobId: data.id };
}

async function sendBatch(emails: SendEmailOptions[]): Promise<SendEmailResult[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return emails.map(() => ({ success: false, error: "Not authenticated" }));

  const results: SendEmailResult[] = [];
  const valid: { opts: SendEmailOptions; index: number }[] = [];

  for (let i = 0; i < emails.length; i++) {
    const err = validatePayload(emails[i]);
    if (err) {
      results[i] = { success: false, error: err };
    } else {
      valid.push({ opts: emails[i], index: i });
    }
  }

  if (valid.length === 0) return results;

  const rows = valid.map((v) => ({
    user_id: userData.user!.id,
    to_address: v.opts.to,
    from_address: v.opts.from,
    subject: v.opts.subject,
    html_body: v.opts.html || null,
    plain_body: v.opts.text || null,
    smtp_server_id: v.opts.smtpServerId || null,
  }));

  const { data, error } = await supabase.from("email_queue").insert(rows).select("id");

  if (error) {
    for (const v of valid) results[v.index] = { success: false, error: error.message };
  } else {
    for (let j = 0; j < valid.length; j++) {
      results[valid[j].index] = { success: true, jobId: data[j]?.id };
    }
  }

  return results;
}

async function getStatus(jobId: string): Promise<EmailStatus | null> {
  const { data } = await supabase
    .from("email_queue")
    .select("id, status, to_address, from_address, subject, sent_at, error_message, attempts")
    .eq("id", jobId)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    status: data.status,
    to: data.to_address,
    from: data.from_address,
    subject: data.subject,
    sentAt: data.sent_at,
    error: data.error_message,
    attempts: data.attempts,
  };
}

export const edapostEmail = { send, sendBatch, getStatus };
