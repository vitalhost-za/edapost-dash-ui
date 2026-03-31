# EdaPost — System Architecture

## Overview

EdaPost is a self-hosted email infrastructure platform — a complete alternative to services like SendGrid, Mailgun, or Amazon SES. It provides full control over SMTP sending infrastructure with a modern dashboard for managing every aspect of email delivery.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│           Frontend (React 18 Dashboard)             │
│                                                     │
│  Hosted on: Vercel                                  │
│  URL: edapost-dash-ui.vercel.app                    │
│  Stack: React 18 + TypeScript + Tailwind + shadcn   │
│                                                     │
│  Pages: Dashboard, Servers, Compose, Campaigns,     │
│  Campaign Analytics, Templates, Contact Lists,      │
│  Queue, Logs, Bounces, Suppression List,            │
│  DNS Health, Analytics, Monitoring, Webhook Log,     │
│  Settings, Login                                    │
└───────────────────────┬─────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼─────────────────────────────┐
│              Backend (Supabase BaaS)                │
│                                                     │
│  Project: qxbbbnawzxnhjkggpuuy                      │
│  Region: West EU (Paris)                            │
│                                                     │
│  ┌─────────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ PostgreSQL  │ │  Auth    │ │  Edge Functions  │ │
│  │ (21 tables) │ │ (JWT)   │ │  (12 Deno fns)   │ │
│  └─────────────┘ └──────────┘ └────────┬─────────┘ │
└────────────────────────────────────────┼────────────┘
                                         │ SMTP (port 587)
┌────────────────────────────────────────▼────────────┐
│            Mail Server (Hetzner VPS)                │
│                                                     │
│  IP: 46.225.10.27                                   │
│  Hostname: mail.edapost.net                         │
│  OS: Ubuntu 24.04 LTS                              │
│  Specs: CX23 — 2 vCPU, 4 GB RAM, Nuremberg         │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Postfix  │ │ OpenDKIM │ │  Rspamd  │            │
│  │ (SMTP)   │ │ (signing)│ │ (filter) │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │  Redis   │ │  Certbot │ │   UFW    │            │
│  │ (queue)  │ │  (TLS)   │ │(firewall)│            │
│  └──────────┘ └──────────┘ └──────────┘            │
│  ┌──────────────────┐ ┌────────────────┐            │
│  │   Prometheus     │ │    Grafana     │            │
│  │  (metrics)       │ │  (dashboards)  │            │
│  └──────────────────┘ └────────────────┘            │
└─────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Frontend — Vercel

| Attribute | Detail |
|-----------|--------|
| **URL** | edapost-dash-ui.vercel.app |
| **Framework** | React 18 + TypeScript |
| **Build** | Vite 5 (SWC) |
| **UI** | shadcn-ui (60+ Radix components) |
| **Styling** | Tailwind CSS 3 + dark mode |
| **Routing** | React Router 6 |
| **State** | TanStack React Query + React Context |
| **Forms** | React Hook Form + Zod |
| **Charts** | Recharts |

**16 pages** covering the full email operations lifecycle: compose, campaigns, A/B testing, queue monitoring, delivery logs, bounce/complaint management, suppression lists, DNS health, analytics, server monitoring, webhook tracking, and settings.

### 2. Backend — Supabase

| Attribute | Detail |
|-----------|--------|
| **Project ID** | qxbbbnawzxnhjkggpuuy |
| **Database** | PostgreSQL (21 tables) |
| **Auth** | Email/password with JWT |
| **Edge Functions** | 12 Deno serverless functions |
| **Realtime** | Queue page live updates |
| **Storage** | Campaign attachments |

#### Database Tables (21)

| Table | Purpose |
|-------|---------|
| `smtp_servers` | SMTP server config + health |
| `sending_domains` | Domain DNS verification |
| `email_queue` | Email delivery queue |
| `email_logs` | Complete event history |
| `campaigns` | Campaign management |
| `campaign_recipients` | Per-recipient tracking |
| `campaign_attachments` | File attachments |
| `ab_test_variants` | A/B test variants |
| `email_templates` | Reusable templates |
| `bounces` | Bounce records |
| `suppression_list` | Blocked addresses |
| `delivery_stats` | Hourly aggregate metrics |
| `domain_rate_limits` | Per-domain send limits |
| `domain_send_tracking` | Rate limit enforcement |
| `ip_warmup` | IP warmup schedule |
| `contact_lists` | Contact groups |
| `contact_list_members` | Individual contacts |
| `webhooks` | Webhook endpoints |
| `webhook_deliveries` | Webhook delivery logs |
| `api_keys` | API key management |
| `user_settings` | User preferences + alert thresholds |
| `failover_events` | Failover event logs |
| `profiles` | User profiles |

#### Edge Functions (12)

| Function | Purpose |
|----------|---------|
| `smtp-worker` | Core email sending engine — queue processing, MIME construction, SMTP delivery, retry logic, rate limiting, warmup caps, suppression checks |
| `process-bounces` | DSN parser, hard/soft bounce classification, auto-suppression |
| `process-complaints` | ARF (RFC 5965) parser, FBL handling, auto-suppression |
| `process-unsubscribe` | List-Unsubscribe (RFC 8058) handler |
| `send-test-email` | Queue a test email |
| `test-smtp-connection` | SMTP connectivity validation |
| `verify-dns` | SPF/DKIM/DMARC/MX/PTR verification via Cloudflare DNS API |
| `process-scheduled-campaigns` | Campaign scheduling, A/B distribution, merge tags |
| `dispatch-webhooks` | Webhook delivery with HMAC-SHA256 signing |
| `retry-webhooks` | Failed webhook retry with exponential backoff |
| `check-alerts` | Monitors metrics + sends alerts via Slack/PagerDuty/email |
| `health-check-smtp` | SMTP health monitoring + automatic failover |

### 3. Mail Server — Hetzner VPS

| Attribute | Detail |
|-----------|--------|
| **Provider** | Hetzner |
| **Plan** | CX23 (2 vCPU, 4 GB RAM, 40 GB SSD) |
| **IP** | 46.225.10.27 |
| **Hostname** | mail.edapost.net |
| **OS** | Ubuntu 24.04 LTS |
| **Location** | Nuremberg, Germany (nbg1-dc3) |
| **Cost** | ~€4.01/mo |

#### Installed Services

| Service | Version | Purpose |
|---------|---------|---------|
| Postfix | 3.8.1 | SMTP engine — sends email to the internet |
| OpenDKIM | — | DKIM signing (2048-bit key, `default` selector) |
| Rspamd | — | Spam filtering (milter integration with Postfix) |
| Redis | — | Email job queue (bound to localhost, AOF persistence) |
| Certbot | — | Let's Encrypt TLS certificates (TLSv1.3, auto-renewal) |
| UFW | — | Firewall (ports 22, 25, 465, 587, 80, 443) |
| Prometheus | — | Metrics collection |
| Grafana | — | Monitoring dashboards |
| Node Exporter | — | CPU/RAM/disk metrics |

#### DNS Records

| Type | Name | Value | Status |
|------|------|-------|--------|
| A | `mail.edapost.net` | `46.225.10.27` | Valid |
| MX | `edapost.net` | `mail.edapost.net` (priority 10) | Valid |
| PTR | `46.225.10.27` | `mail.edapost.net` (IPv4 + IPv6) | Valid |
| TXT (SPF) | `edapost.net` | `v=spf1 ip4:46.225.10.27 -all` | Valid |
| TXT (DKIM) | `default._domainkey.edapost.net` | 2048-bit public key | Valid |
| TXT (DMARC) | `_dmarc.edapost.net` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@edapost.net; pct=100` | Valid |

---

## Email Sending Pipeline

```
User composes email in Dashboard
        │
        ▼
Email queued in PostgreSQL (status: "queued")
        │
        ▼
smtp-worker edge function picks up batch
        │
        ├── Check suppression list → blocked? → mark "failed"
        ├── Check warmup volume cap → over limit? → defer 15 min
        ├── Check domain rate limit → over limit? → defer 1 min
        │
        ▼
Build MIME message (HTML + plain text + attachments + CSS inlined)
Add List-Unsubscribe headers
        │
        ▼
SMTP connect to Postfix (46.225.10.27:587)
EHLO → STARTTLS → MAIL FROM → RCPT TO → DATA → message
        │
        ├── Success → status: "sent", log event, track for rate limits
        │
        ├── Hard bounce (550-555) →
        │     ├── status: "failed"
        │     ├── process-bounces → classify → add to suppression_list
        │     └── log bounce event
        │
        ├── Soft bounce (421-452) →
        │     ├── retry with exponential backoff (30s × 2^n)
        │     └── suppress after 5 cumulative soft bounces
        │
        └── Complaint detected →
              └── process-complaints → parse ARF → auto-suppress
```

---

## Security

| Layer | Measure |
|-------|---------|
| **SSH** | Key-only auth, root login disabled, rate limited |
| **Firewall** | UFW — only ports 22/25/465/587/80/443 open |
| **TLS** | TLSv1.3 (Let's Encrypt), auto-renewal with Postfix reload hook |
| **Email Auth** | SPF (-all), DKIM (2048-bit), DMARC (p=quarantine) |
| **App Auth** | Supabase JWT with Row Level Security on every table |
| **API** | Nginx rate limiting (10 req/s), security headers (HSTS, X-Frame-Options) |
| **Secrets** | API keys stored as hashes, webhook secrets for HMAC-SHA256 signing |

---

## Monitoring & Alerting

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Delivery rate | email_logs | < 95% |
| Bounce rate | bounce processor | > 2% |
| Complaint rate | FBL processor | > 0.1% |
| Queue depth | email_queue | > 10,000 |
| Queue latency | oldest job age | > 300s |
| TLS cert expiry | smtp_servers | < 14 days |
| Server status | heartbeat | Offline/degraded |

**Alert channels:** Slack webhook, PagerDuty Events API v2, email notifications.

---

## Implementation Progress

| Phase | Status |
|-------|--------|
| 1. Server Provisioning | Complete |
| 2. DNS Configuration | Complete |
| 3. Postfix SMTP | Complete |
| 4. TLS Encryption | Complete |
| 5. DKIM Signing | Complete |
| 6. Email Queue System | Complete |
| 7. Bounce & Complaint Handling | Complete |
| 8. IP Warmup | In Progress (30-day warmup) |
| 9. Monitoring & Observability | Complete |
| 10. App Integration | Complete |
| 11. Backup & Failover | Partially complete (app logic done, server backups pending) |
| 12. Scaling | Future phase |

**Overall: 122/135 tasks completed (90%)**

---

*Last updated: 2026-03-31*
