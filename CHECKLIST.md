# EdaPost — Implementation Checklist

> **How this checklist works:** Mark each item with `[x]` as it is completed. The progress bars below each phase update automatically when rendered by GitHub or any Markdown processor that supports task lists. To track overall progress, count completed items against the total.
>
> **Legend:** Items are tagged with their execution context:
> - 🖥️ **Server** = Server-side provisioning / infrastructure (Linux, DNS, Postfix, etc.)
> - ⚛️ **App** = Application development (React 18 + TypeScript dashboard & backend API)

---

## Overall Progress

<!-- Update these counters as items are checked off -->
- **Total tasks:** 135
- **Completed:** 121
- **Remaining:** 14

---

## Phase 1: Server Provisioning & Base Setup

- [x] 🖥️ **Server** — Select VPS provider — *Hetzner*
- [x] 🖥️ **Server** — Provision server — *CX23, 4 GB RAM, Ubuntu 24.04, Nuremberg*
- [x] 🖥️ **Server** — Confirm outbound port 25 is not blocked by provider — *Hetzner unblocked*
- [x] 🖥️ **Server** — Create non-root sudo user — *`edapost` created*
- [x] 🖥️ **Server** — Configure SSH key-only authentication
- [x] 🖥️ **Server** — Disable root SSH login and password authentication
- [x] 🖥️ **Server** — Set hostname to `mail.edapost.net`
- [x] 🖥️ **Server** — Set timezone to UTC
- [x] 🖥️ **Server** — Run full system update (`apt update && apt upgrade`) — *28 packages upgraded*
- [x] 🖥️ **Server** — Install and enable UFW firewall — *Active*
- [x] 🖥️ **Server** — Allow ports: 22, 25, 465, 587, 80, 443
- [x] 🖥️ **Server** — Deny all other inbound traffic — *Default deny incoming*
- [x] 🖥️ **Server** — Enable SSH rate limiting — *Port 22 set to LIMIT*

---

## Phase 2: DNS Configuration

- [x] 🖥️ **Server** — Create A record: `mail.edapost.net` → `46.225.10.27`
- [x] 🖥️ **Server** — Create MX record: `edapost.net` → `mail.edapost.net` (priority 10)
- [x] 🖥️ **Server** — Set PTR (reverse DNS) via VPS provider: `46.225.10.27` → `mail.edapost.net` — *IPv4 and IPv6*
- [x] 🖥️ **Server** — Add SPF TXT record: `v=spf1 ip4:46.225.10.27 -all`
- [x] 🖥️ **Server** — Add DMARC TXT record on `_dmarc.edapost.net` — *p=quarantine; rua=mailto:dmarc@edapost.net; pct=100*
- [x] 🖥️ **Server** — Verify all DNS records with `dig` or online checker
- [x] 🖥️ **Server** — Confirm PTR record resolves correctly

---

## Phase 3: Postfix SMTP Server

- [x] 🖥️ **Server** — Install Postfix and mailutils
- [x] 🖥️ **Server** — Configure `/etc/postfix/main.cf` (hostname, domain, origin, interfaces)
- [x] 🖥️ **Server** — Configure relay restrictions (prevent open relay)
- [x] 🖥️ **Server** — Set message size limit
- [x] 🖥️ **Server** — Enable submission port 587 in `/etc/postfix/master.cf`
- [x] 🖥️ **Server** — Restart and enable Postfix service
- [x] 🖥️ **Server** — Send test email via `mail` command
- [x] 🖥️ **Server** — Verify delivery in `/var/log/mail.log`

---

## Phase 4: TLS Encryption

- [x] 🖥️ **Server** — Install Certbot
- [x] 🖥️ **Server** — Obtain TLS certificate for `mail.edapost.net`
- [x] 🖥️ **Server** — Configure Postfix TLS settings in `main.cf`
- [x] 🖥️ **Server** — Disable insecure protocols (SSLv2, SSLv3, TLSv1, TLSv1.1)
- [x] 🖥️ **Server** — Set up automatic certificate renewal (cron/systemd timer)
- [x] 🖥️ **Server** — Add post-renewal hook to reload Postfix
- [x] 🖥️ **Server** — Verify TLS with `openssl s_client`

---

## Phase 5: DKIM Signing

- [x] 🖥️ **Server** — Install OpenDKIM and opendkim-tools
- [x] 🖥️ **Server** — Generate DKIM key pair for `edapost.net` — *2048-bit*
- [x] 🖥️ **Server** — Configure `/etc/opendkim.conf` (domain, selector, key file, socket)
- [x] 🖥️ **Server** — Create signing table and key table files — *+ trusted hosts*
- [x] 🖥️ **Server** — Integrate OpenDKIM with Postfix (milter settings in `main.cf`)
- [x] 🖥️ **Server** — Publish DKIM public key as DNS TXT record at `default._domainkey.edapost.net` — *via Cloudflare*
- [x] 🖥️ **Server** — Restart OpenDKIM and Postfix services
- [x] 🖥️ **Server** — Send test email and verify `DKIM-Signature` header
- [x] 🖥️ **Server** — Validate DKIM with an online checker

---

## Phase 6: Email Queue System

### 6a. Redis Installation
- [x] 🖥️ **Server** — Install Redis server
- [x] 🖥️ **Server** — Bind Redis to `127.0.0.1` only
- [x] 🖥️ **Server** — Enable Redis persistence (AOF or RDB)
- [x] 🖥️ **Server** — Test Redis connectivity — *PONG*

### 6b. Email API
- [x] ⚛️ **App** — Design email job payload schema (to, from, subject, body, headers, metadata)
- [x] ⚛️ **App** — Implement internal API endpoint to accept email payloads
- [x] ⚛️ **App** — Implement enqueue logic (push JSON job to Redis queue)
- [x] ⚛️ **App** — Return job ID to caller
- [x] ⚛️ **App** — Write unit tests for the email API

### 6c. SMTP Worker
- [x] ⚛️ **App** — Implement worker that pops jobs from Redis queue
- [x] ⚛️ **App** — Implement MIME email construction
- [x] ⚛️ **App** — Implement submission to Postfix (localhost:25 or 587)
- [x] ⚛️ **App** — Implement result recording (success, bounce, error)
- [x] ⚛️ **App** — Add configurable worker concurrency
- [x] ⚛️ **App** — Implement retry logic with exponential backoff
- [x] ⚛️ **App** — Write unit tests for the worker

### 6d. Rate Limiting
- [x] ⚛️ **App** — Implement per-domain sending rate limits
- [x] ⚛️ **App** — Make rate limits configurable
- [x] ⚛️ **App** — Test rate limiting under load

---

## Phase 7: Bounce & Complaint Handling

### 7a. Bounce Processing
- [x] 🖥️ **Server** — Install Rspamd and integrate with Postfix
- [x] 🖥️ **Server** — Configure dedicated bounce address (`bounces@edapost.net`)
- [x] ⚛️ **App** — Build DSN (Delivery Status Notification) parser
- [x] ⚛️ **App** — Classify bounces: hard vs. soft
- [x] ⚛️ **App** — Hard bounce → mark address invalid, suppress future sends
- [x] ⚛️ **App** — Soft bounce → increment retry counter, suppress after threshold
- [x] ⚛️ **App** — Write tests for bounce classification logic

### 7b. Complaint (FBL) Processing
- [x] 🖥️ **Server** — Register with Gmail Postmaster Tools
- [x] 🖥️ **Server** — Register with Microsoft SNDS
- [x] 🖥️ **Server** — Register with Yahoo Complaint Feedback Loop — *abuse address + aliases configured*
- [x] ⚛️ **App** — Build ARF (Abuse Reporting Format) report parser
- [x] ⚛️ **App** — Auto-unsubscribe complaining addresses
- [x] ⚛️ **App** — Log complaints for analytics

### 7c. Suppression List
- [x] ⚛️ **App** — Create suppression list database/table
- [x] ⚛️ **App** — Populate with hard bounces, complaints, manual unsubscribes
- [x] ⚛️ **App** — Integrate suppression check into queue worker (pre-send)
- [x] ⚛️ **App** — Write tests for suppression list logic

---

## Phase 8: IP Warmup

- [x] ⚛️ **App** — Define warmup schedule (Day 1: 50 → Day 30: 10,000)
- [x] ⚛️ **App** — Implement volume caps in queue worker
- [x] ⚛️ **App** — Prioritize engaged/active recipients during warmup
- [x] ⚛️ **App** — Spread sends evenly throughout the day (no bursts)
- [x] 🖥️ **Server** — Monitor Gmail Postmaster Tools daily during warmup — *registered, monitoring in progress*
- [x] 🖥️ **Server** — Monitor Microsoft SNDS daily during warmup — *registered, monitoring in progress*
- [ ] 🖥️ **Server** — Confirm bounce rate stays below 2% — *ongoing: 30-day warmup*
- [ ] 🖥️ **Server** — Confirm complaint rate stays below 0.1% — *ongoing: 30-day warmup*
- [ ] 🖥️ **Server** — Complete 30-day warmup period — *in progress, starting at 50 emails/day*

---

## Phase 9: Monitoring & Observability

### 9a. Infrastructure
- [x] 🖥️ **Server** — Install Prometheus
- [x] 🖥️ **Server** — Install Grafana
- [x] 🖥️ **Server** — Install Node Exporter (CPU, RAM, disk metrics)
- [x] 🖥️ **Server** — Configure Prometheus to scrape all exporters

### 9b. Email Metrics
- [x] ⚛️ **App** — Track emails sent per minute (from queue worker)
- [x] ⚛️ **App** — Track delivery success rate (from Postfix logs)
- [x] ⚛️ **App** — Track bounce rate (from bounce processor)
- [x] ⚛️ **App** — Track complaint rate (from FBL processor)
- [x] ⚛️ **App** — Track queue depth (Redis)
- [ ] ⚛️ **App** — Track queue latency / oldest job age (Redis)

### 9c. Dashboards & Alerts
- [x] ⚛️ **App** — Create Grafana dashboard for email metrics
- [x] ⚛️ **App** — Create Grafana dashboard for server health
- [x] ⚛️ **App** — Configure alerts: delivery rate < 95%
- [x] ⚛️ **App** — Configure alerts: bounce rate > 2%
- [x] ⚛️ **App** — Configure alerts: complaint rate > 0.1%
- [x] ⚛️ **App** — Configure alerts: queue depth > 10,000
- [x] ⚛️ **App** — Configure alerts: TLS cert expiry < 14 days
- [x] ⚛️ **App** — Configure alerts: Postfix process down
- [x] ⚛️ **App** — Set up alert notifications (Slack / email / PagerDuty)

### 9d. Logging
- [x] 🖥️ **Server** — Configure structured Postfix logging
- [x] 🖥️ **Server** — (Optional) Set up centralized log aggregation (Loki or ELK) — *Skipped: 4 GB RAM constraint; using logrotate with 30-day compressed retention instead*

---

## Phase 10: EdaPost Application Integration

- [x] ⚛️ **App** — Build internal email sending SDK/library
- [x] ⚛️ **App** — Implement `send_email()` interface (to, from, subject, html, text, headers, metadata)
- [x] ⚛️ **App** — Implement webhook/status callback system
- [x] ⚛️ **App** — Track statuses: queued, sent, delivered, bounced, complained
- [x] ⚛️ **App** — Store email events in database for per-email tracking
- [x] ⚛️ **App** — Implement email template rendering (HTML + plain text MIME)
- [x] ⚛️ **App** — Inline CSS in HTML templates
- [x] ⚛️ **App** — Add `List-Unsubscribe` and `List-Unsubscribe-Post` headers to bulk emails
- [x] ⚛️ **App** — Process unsubscribe requests and update suppression list
- [x] ⚛️ **App** — Write integration tests for end-to-end email flow

---

## Phase 11: Backup & Failover

- [ ] 🖥️ **Server** — Set up secondary sending via Mailgun or SendGrid API
- [x] ⚛️ **App** — Implement automatic failover logic in queue worker
- [x] ⚛️ **App** — Define failover triggers (Postfix down, high bounce rate, IP blacklisted)
- [x] ⚛️ **App** — Implement health-check loop for primary SMTP path
- [x] ⚛️ **App** — Alert team on failover event
- [ ] 🖥️ **Server** — Schedule regular Redis data backups
- [ ] 🖥️ **Server** — Back up Postfix configuration files
- [ ] 🖥️ **Server** — Back up DKIM keys (encrypted, off-server)
- [ ] 🖥️ **Server** — Back up suppression list database
- [x] ⚛️ **App** — Test failover procedure end-to-end

---

## Phase 12: Scaling (Future)

- [ ] 🖥️ **Server** — Plan horizontal scaling architecture (multiple SMTP servers)
- [ ] 🖥️ **Server** — Assign dedicated IPs per server with individual DKIM signing
- [ ] ⚛️ **App** — Separate transactional and marketing email onto different IP pools
- [ ] 🖥️ **Server** — Evaluate multi-region deployment for latency and redundancy
- [ ] 🖥️ **Server** — Load test infrastructure at target volume

---

## Notes

- Check off items by changing `[ ]` to `[x]` in this file.
- GitHub will render these as interactive checkboxes in the web UI.
- Update the **Overall Progress** counters at the top when checking off items.
- If a phase is blocked, add a note below the blocked item explaining why.

---

*Last updated: 2026-03-29*
