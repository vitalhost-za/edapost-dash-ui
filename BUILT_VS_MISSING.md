# EdaPost — What's Built vs What's Missing

> Generated: 2026-03-18
> Source: Analysis of the `edapost-dash-ui` codebase against `CHECKLIST.md` (96 tasks) and `PROJECT_TASK.md`

---

## Executive Summary

The **dashboard UI** is substantially complete — a fully functional React + Supabase application with real CRUD operations, real-time data, and edge function integrations across 15+ pages. However, the **backend infrastructure** described in the project plan (Postfix, Redis queue workers, DKIM, bounce processors, monitoring stack) is **entirely outside this repository** and has no evidence of implementation here.

| Area | Status |
|------|--------|
| Dashboard UI (React app) | ~90% built |
| Supabase Backend (tables, auth, edge functions) | ~70% built |
| SMTP Infrastructure (Postfix, TLS, DKIM) | Not in this repo |
| Queue Worker (Redis consumer, SMTP submission) | Not in this repo |
| Bounce/Complaint Processors | Not in this repo |
| Monitoring Stack (Prometheus, Grafana) | Not in this repo |
| IP Warmup Automation | UI only (no backend logic) |
| Failover/Backup System | Not in this repo |

---

## Phase-by-Phase Breakdown

### Phase 1: Server Provisioning & Base Setup — 0/13 tasks

**Status: Not applicable to this repo**

All 13 tasks (VPS provisioning, SSH hardening, firewall, hostname) are server-level infrastructure tasks that would be done outside this UI codebase.

| Task | Status |
|------|--------|
| VPS provisioning | Not in this repo |
| SSH hardening, firewall, hostname, timezone | Not in this repo |
| UFW firewall rules | Not in this repo |

---

### Phase 2: DNS Configuration — Partially Built (UI only) — ~2/7 tasks

**What's Built:**
- [x] DNS verification UI in `DnsHealth.tsx` — fully functional page to manage sending domains
- [x] `verify-dns` edge function — queries Cloudflare DNS API to check SPF, DKIM, DMARC, MX, and PTR records
- [x] Domain health scoring and detailed record analysis with recommendations
- [x] DKIM selector configuration UI

**What's Missing:**
- [ ] Actual DNS record creation (A, MX, PTR, SPF, DMARC) — must be done at registrar/DNS provider
- [ ] PTR (reverse DNS) configuration — must be done at VPS provider
- [ ] The UI can *verify* records but cannot *create* them

---

### Phase 3: Postfix SMTP Server — Not in this repo — 0/8 tasks

**What's Built:**
- [x] SMTP server management UI in `Servers.tsx` — add/edit/delete server configs
- [x] `test-smtp-connection` edge function — opens TCP connection, performs EHLO, checks TLS
- [x] Server status tracking (online/offline/degraded/maintenance)

**What's Missing:**
- [ ] Actual Postfix installation and configuration
- [ ] `/etc/postfix/main.cf` and `master.cf` setup
- [ ] Relay restrictions, message size limits
- [ ] Submission port 587 configuration
- [ ] No actual SMTP server runs in this repo — the UI manages *references* to external SMTP servers

---

### Phase 4: TLS Encryption — Not in this repo — 0/7 tasks

**What's Built:**
- The SMTP server form captures TLS settings (TLS enabled flag)
- Connection test checks for STARTTLS capability

**What's Missing:**
- [ ] Certbot installation and certificate generation
- [ ] Postfix TLS configuration
- [ ] Auto-renewal setup
- [ ] All TLS tasks are server-side infrastructure

---

### Phase 5: DKIM Signing — Not in this repo — 0/9 tasks

**What's Built:**
- DNS Health page verifies DKIM DNS records exist
- DKIM selector field in domain configuration

**What's Missing:**
- [ ] OpenDKIM installation and key generation
- [ ] Signing table and key table configuration
- [ ] Postfix milter integration
- [ ] All DKIM tasks are server-side infrastructure

---

### Phase 6: Email Queue System — Partially Built — ~5/14 tasks

#### 6a. Redis Installation — 0/4 tasks
**Status: Not in this repo** — The queue uses Supabase (PostgreSQL `email_queue` table), not Redis as specified in the plan.

#### 6b. Email API — ~3/5 tasks
**What's Built:**
- [x] Email job payload schema exists (`email_queue` table with: to, from, subject, body, headers, metadata)
- [x] Internal API to enqueue emails — Compose page inserts directly into `email_queue` table
- [x] Job ID returned (Supabase row ID)
- [x] `send-test-email` edge function for test sends

**What's Missing:**
- [ ] Dedicated API endpoint (currently direct Supabase inserts from client)
- [ ] Unit tests for the email API

#### 6c. SMTP Worker — 0/7 tasks
**What's Built:**
- Queue page shows items and their status
- Retry mechanism exists in UI (re-queues failed items)

**What's Missing:**
- [ ] **No actual worker process** that pops jobs from the queue and submits to Postfix
- [ ] No MIME email construction
- [ ] No SMTP submission logic
- [ ] No result recording from actual sends
- [ ] No configurable concurrency
- [ ] No exponential backoff retry logic
- [ ] No unit tests

> **This is the most critical gap.** The UI can enqueue emails, but nothing processes them.

#### 6d. Rate Limiting — ~1/3 tasks
**What's Built:**
- [x] Rate limit configuration in Settings page (sends per second/minute/hour)

**What's Missing:**
- [ ] No actual rate limiting enforcement in a worker
- [ ] No per-domain rate limiting

---

### Phase 7: Bounce & Complaint Handling — Partially Built — ~5/17 tasks

#### 7a. Bounce Processing — ~2/7 tasks
**What's Built:**
- [x] Bounces page (`Bounces.tsx`) — displays bounces from `bounces` table
- [x] Bounce classification (hard vs soft) exists in schema and UI
- [x] Bounce statistics and top bouncing domain analysis in Analytics

**What's Missing:**
- [ ] Rspamd installation and integration
- [ ] Dedicated bounce address configuration
- [ ] DSN parser to automatically process bounce emails
- [ ] Automatic hard bounce → suppress logic (manual only via UI)
- [ ] Automatic soft bounce → retry counter logic

#### 7b. Complaint (FBL) Processing — 0/6 tasks
**What's Built:**
- Email logs track `complained` event type
- Analytics shows complaint metrics

**What's Missing:**
- [ ] Gmail Postmaster Tools registration
- [ ] Microsoft SNDS registration
- [ ] Yahoo CFL registration
- [ ] ARF report parser
- [ ] Auto-unsubscribe on complaint
- [ ] All complaint handling is manual — no automated FBL processing

#### 7c. Suppression List — ~3/4 tasks
**What's Built:**
- [x] Suppression list table (`suppression_list`) with full CRUD UI
- [x] Populate from bounces (bulk add from Bounces page)
- [x] Manual add/delete entries, CSV export

**What's Missing:**
- [ ] **Pre-send suppression check in queue worker** — critical gap, no worker exists to enforce it

---

### Phase 8: IP Warmup — UI Only — ~1/9 tasks

**What's Built:**
- [x] IP warmup data displayed on Dashboard (queries `ip_warmup` table)
- [x] Warmup status tracking in database schema

**What's Missing:**
- [ ] No warmup schedule implementation
- [ ] No volume caps in queue worker
- [ ] No recipient prioritization logic
- [ ] No send spreading/throttling
- [ ] No automated monitoring during warmup
- [ ] No bounce/complaint rate enforcement
- [ ] The UI shows warmup *status* but no automation drives it

---

### Phase 9: Monitoring & Observability — Partially Built (UI only) — ~6/18 tasks

#### 9a. Infrastructure (Prometheus/Grafana) — 0/4 tasks
**Not in this repo** — No Prometheus, Grafana, or Node Exporter.

#### 9b. Email Metrics — ~4/6 tasks (via Supabase, not Prometheus)
**What's Built:**
- [x] Emails sent tracking (from `delivery_stats` and `email_logs`)
- [x] Delivery success rate (Analytics page)
- [x] Bounce rate tracking (Analytics page)
- [x] Complaint rate tracking (Analytics page)

**What's Missing:**
- [ ] Queue depth metric (partially — shown in Queue page but not as a Prometheus metric)
- [ ] Queue latency / oldest job age metric
- [ ] These metrics are in the React UI, not in a proper monitoring stack

#### 9c. Dashboards & Alerts — ~2/9 tasks
**What's Built:**
- [x] Dashboard page with delivery metrics, charts, server status
- [x] Analytics page with delivery volume, bounce rate, domain distribution charts

**What's Missing:**
- [ ] No alerting system (no alerts for delivery rate < 95%, bounce rate > 2%, etc.)
- [ ] No notifications (Slack/email/PagerDuty) on threshold breaches
- [ ] No TLS cert expiry monitoring
- [ ] No Postfix process health monitoring

#### 9d. Logging — ~1/2 tasks
**What's Built:**
- [x] Email logs page with real-time Supabase subscriptions, filtering, search, detailed event viewer

**What's Missing:**
- [ ] No structured Postfix log integration
- [ ] No centralized log aggregation (Loki/ELK)

---

### Phase 10: EdaPost Application Integration — Partially Built — ~5/10 tasks

**What's Built:**
- [x] Email sending interface (Compose page with full form: to, from, subject, html, text, headers)
- [x] Webhook configuration and management (Settings page, `webhooks` table)
- [x] `dispatch-webhooks` and `retry-webhooks` edge functions
- [x] Status tracking: queued, sent, delivered, bounced, complained visible in Logs page
- [x] Email template rendering (HTML editor with visual/code modes, templates page)
- [x] CSS inlining awareness (templates support inline styles)
- [x] `List-Unsubscribe` header support (custom headers in Compose)

**What's Missing:**
- [ ] No internal SDK/library — client-side direct Supabase calls instead
- [ ] No server-side template rendering pipeline (HTML editing is client-side only)
- [ ] No automated unsubscribe request processing
- [ ] No integration tests for end-to-end email flow
- [ ] Webhook status callback system exists but unclear if it fires on actual email events

---

### Phase 11: Backup & Failover — Not Built — 0/10 tasks

**What's Built:**
- Nothing in this repo addresses failover.

**What's Missing:**
- [ ] No secondary sending provider (Mailgun/SendGrid) integration
- [ ] No automatic failover logic
- [ ] No health-check loop for primary SMTP
- [ ] No backup strategy for Redis/Postfix/DKIM/suppression data
- [ ] No failover alerting

---

### Phase 12: Scaling (Future) — Not Built — 0/5 tasks

**Status: Future phase — not started**

- [ ] No horizontal scaling architecture
- [ ] No dedicated IP pool management
- [ ] No transactional/marketing IP separation
- [ ] No multi-region deployment
- [ ] No load testing

---

## Summary Scorecard

| Phase | Description | Tasks | Done | % |
|-------|-------------|-------|------|---|
| 1 | Server Provisioning | 13 | 0 | 0% |
| 2 | DNS Configuration | 7 | 2 | 29% |
| 3 | Postfix SMTP Server | 8 | 0 | 0% |
| 4 | TLS Encryption | 7 | 0 | 0% |
| 5 | DKIM Signing | 9 | 0 | 0% |
| 6 | Email Queue System | 14 | 5 | 36% |
| 7 | Bounce & Complaint Handling | 17 | 5 | 29% |
| 8 | IP Warmup | 9 | 1 | 11% |
| 9 | Monitoring & Observability | 18 | 6 | 33% |
| 10 | App Integration | 10 | 5 | 50% |
| 11 | Backup & Failover | 10 | 0 | 0% |
| 12 | Scaling | 5 | 0 | 0% |
| **Total** | | **96** | **24** | **25%** |

---

## What's Fully Built (Dashboard UI)

These features are **production-ready** in the React dashboard:

| Feature | Page/Component | Backend |
|---------|---------------|---------|
| Authentication | Login, ResetPassword, AuthContext | Supabase Auth |
| Dashboard overview | Dashboard.tsx | Supabase queries |
| SMTP server management | Servers.tsx | Full CRUD + connection test edge function |
| DNS health verification | DnsHealth.tsx | Full CRUD + DNS verification edge function |
| Email composition | Compose.tsx | Full form, file uploads, template loading |
| A/B testing | AbTestEditor.tsx | Variant creation, split calculation |
| Campaign scheduling | CampaignScheduler.tsx | Timezone, recurrence support |
| Campaign management | Campaigns.tsx | Full CRUD, status updates, analytics |
| Campaign analytics | CampaignAnalytics.tsx | Charts, time-range filtering |
| Email templates | Templates.tsx | Full CRUD, HTML editor, preview |
| Contact list management | ContactLists.tsx | Full CRUD, CSV import, member management |
| Email queue monitoring | Queue.tsx | Real-time updates, retry, purge |
| Email log viewer | Logs.tsx | Real-time updates, filtering, detail view |
| Bounce management | Bounces.tsx | Type filtering, suppression list integration |
| Suppression list | Bounces.tsx (tab) | Full CRUD, CSV export |
| Analytics dashboard | Analytics.tsx | Delivery, bounce, engagement charts |
| Settings & config | Settings.tsx | Profile, API keys, webhooks, system settings |
| HTML email editor | HtmlEditor.tsx | Visual/code modes, formatting toolbar |
| CSV contact import | CsvImport.tsx | Parsing, validation, duplicate detection |
| Merge tag picker | MergeTagPicker.tsx | Tag insertion for personalization |

---

## Critical Gaps (Highest Priority)

### 1. No SMTP Queue Worker
The biggest gap. Emails are enqueued into `email_queue` but **nothing processes them**. Need a background worker that:
- Dequeues jobs
- Constructs MIME messages
- Submits to Postfix via SMTP
- Records delivery results
- Handles retries with backoff

### 2. No Actual SMTP Infrastructure
Postfix, TLS certificates, and DKIM signing (Phases 3-5) are not set up. The UI manages server *configurations* but no mail server is running.

### 3. No Automated Bounce/Complaint Processing
Bounces and complaints can be viewed in the UI but:
- No DSN parser ingests bounce emails automatically
- No FBL processor handles complaint reports
- Suppression list exists but is not checked pre-send (no worker to check it)

### 4. No Alerting System
Analytics pages show metrics, but there are no automated alerts when:
- Delivery rate drops below threshold
- Bounce/complaint rates spike
- Servers go offline
- Queue depth exceeds limits

### 5. No Failover Mechanism
No backup sending provider integration. If the primary SMTP path fails, there is no automatic fallback.

---

## Architecture Gap

The project plan describes a **full-stack email infrastructure**:

```
[EdaPost Dashboard UI]  ←── THIS REPO (mostly built)
         │
         ▼
[Supabase Backend]       ←── Partially built (tables, auth, edge functions)
         │
         ▼
[Queue Worker]           ←── NOT BUILT (critical missing piece)
         │
         ▼
[Postfix SMTP Server]    ←── NOT BUILT (server infrastructure)
         │
         ▼
[Internet / Recipients]
         │
         ▼
[Bounce/FBL Processors]  ←── NOT BUILT (feedback loop)
         │
         ▼
[Monitoring Stack]       ←── NOT BUILT (Prometheus/Grafana)
```

The dashboard UI layer is ~90% complete. Everything below it in the stack is 0-36% complete.

---

*Last updated: 2026-03-18*
