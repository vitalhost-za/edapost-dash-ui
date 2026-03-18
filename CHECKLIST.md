# EdaPost — Implementation Checklist

> **How this checklist works:** Mark each item with `[x]` as it is completed. The progress bars below each phase update automatically when rendered by GitHub or any Markdown processor that supports task lists. To track overall progress, count completed items against the total.
>
> **Legend:** Items are tagged with their execution context:
> - 🖥️ **Server** = Server-side provisioning / infrastructure (Linux, DNS, Postfix, etc.)
> - 🟢 **App** = Application development (React 18 + TypeScript dashboard & backend API)

---

## Overall Progress

<!-- Update these counters as items are checked off -->
- **Total tasks:** 96
- **Completed:** 18
- **Remaining:** 78

---

## Phase 1: Server Provisioning & Base Setup

- [ ] 🖥️ **Server** — Select VPS provider (DigitalOcean / Vultr / Linode)
- [ ] 🖥️ **Server** — Provision server (2 vCPU, 4 GB RAM, Ubuntu 22.04, static IP)
- [ ] 🖥️ **Server** — Confirm outbound port 25 is not blocked by provider
- [ ] 🖥️ **Server** — Create non-root sudo user
- [ ] 🖥️ **Server** — Configure SSH key-only authentication
- [ ] 🖥️ **Server** — Disable root SSH login and password authentication
- [ ] 🖥️ **Server** — Set hostname to `mail.edapost.net`
- [ ] 🖥️ **Server** — Set timezone to UTC
- [ ] 🖥️ **Server** — Run full system update (`apt update && apt upgrade`)
- [ ] 🖥️ **Server** — Install and enable UFW firewall
- [ ] 🖥️ **Server** — Allow ports: 22, 25, 465, 587, 80, 443
- [ ] 🖥️ **Server** — Deny all other inbound traffic
- [ ] 🖥️ **Server** — Enable SSH rate limiting

---

## Phase 2: DNS Configuration

- [ ] 🖥️ **Server** — Create A record: `mail.edapost.net` → server IP
- [ ] 🖥️ **Server** — Create MX record: `edapost.net` → `mail.edapost.net` (priority 10)
- [ ] 🖥️ **Server** — Set PTR (reverse DNS) via VPS provider: server IP → `mail.edapost.net`
- [ ] 🖥️ **Server** — Add SPF TXT record: `v=spf1 ip4:<SERVER_IP> -all`
- [ ] 🖥️ **Server** — Add DMARC TXT record on `_dmarc.edapost.net`
- [x] 🖥️ **Server** — Verify all DNS records with `dig` or online checker
- [x] 🖥️ **Server** — Confirm PTR record resolves correctly

---

## Phase 3: Postfix SMTP Server

- [ ] 🖥️ **Server** — Install Postfix and mailutils
- [ ] 🖥️ **Server** — Configure `/etc/postfix/main.cf` (hostname, domain, origin, interfaces)
- [ ] 🖥️ **Server** — Configure relay restrictions (prevent open relay)
- [ ] 🖥️ **Server** — Set message size limit
- [ ] 🖥️ **Server** — Enable submission port 587 in `/etc/postfix/master.cf`
- [ ] 🖥️ **Server** — Restart and enable Postfix service
- [ ] 🖥️ **Server** — Send test email via `mail` command
- [ ] 🖥️ **Server** — Verify delivery in `/var/log/mail.log`

---

## Phase 4: TLS Encryption

- [ ] 🖥️ **Server** — Install Certbot
- [ ] 🖥️ **Server** — Obtain TLS certificate for `mail.edapost.net`
- [ ] 🖥️ **Server** — Configure Postfix TLS settings in `main.cf`
- [ ] 🖥️ **Server** — Disable insecure protocols (SSLv2, SSLv3, TLSv1, TLSv1.1)
- [ ] 🖥️ **Server** — Set up automatic certificate renewal (cron/systemd timer)
- [ ] 🖥️ **Server** — Add post-renewal hook to reload Postfix
- [ ] 🖥️ **Server** — Verify TLS with `openssl s_client`

---

## Phase 5: DKIM Signing

- [ ] 🖥️ **Server** — Install OpenDKIM and opendkim-tools
- [ ] 🖥️ **Server** — Generate DKIM key pair for `edapost.net`
- [ ] 🖥️ **Server** — Configure `/etc/opendkim.conf` (domain, selector, key file, socket)
- [ ] 🖥️ **Server** — Create signing table and key table files
- [ ] 🖥️ **Server** — Integrate OpenDKIM with Postfix (milter settings in `main.cf`)
- [ ] 🖥️ **Server** — Publish DKIM public key as DNS TXT record at `default._domainkey.edapost.net`
- [ ] 🖥️ **Server** — Restart OpenDKIM and Postfix services
- [ ] 🖥️ **Server** — Send test email and verify `DKIM-Signature` header
- [ ] 🖥️ **Server** — Validate DKIM with an online checker

---

## Phase 6: Email Queue System

### 6a. Redis Installation
- [ ] 🖥️ **Server** — Install Redis server
- [ ] 🖥️ **Server** — Bind Redis to `127.0.0.1` only
- [ ] 🖥️ **Server** — Enable Redis persistence (AOF or RDB)
- [ ] 🖥️ **Server** — Test Redis connectivity

### 6b. Email API
- [x] 🟢 **App** — Design email job payload schema (to, from, subject, body, headers, metadata)
- [x] 🟢 **App** — Implement internal API endpoint to accept email payloads
- [x] 🟢 **App** — Implement enqueue logic (push JSON job to Redis queue)
- [x] 🟢 **App** — Return job ID to caller
- [ ] 🟢 **App** — Write unit tests for the email API

### 6c. SMTP Worker
- [ ] 🟢 **App** — Implement worker that pops jobs from Redis queue
- [ ] 🟢 **App** — Implement MIME email construction
- [ ] 🟢 **App** — Implement submission to Postfix (localhost:25 or 587)
- [ ] 🟢 **App** — Implement result recording (success, bounce, error)
- [ ] 🟢 **App** — Add configurable worker concurrency
- [ ] 🟢 **App** — Implement retry logic with exponential backoff
- [ ] 🟢 **App** — Write unit tests for the worker

### 6d. Rate Limiting
- [ ] 🟢 **App** — Implement per-domain sending rate limits
- [x] 🟢 **App** — Make rate limits configurable
- [ ] 🟢 **App** — Test rate limiting under load

---

## Phase 7: Bounce & Complaint Handling

### 7a. Bounce Processing
- [ ] 🖥️ **Server** — Install Rspamd and integrate with Postfix
- [ ] 🖥️ **Server** — Configure dedicated bounce address (`bounces@edapost.net`)
- [ ] 🟢 **App** — Build DSN (Delivery Status Notification) parser
- [ ] 🟢 **App** — Classify bounces: hard vs. soft
- [ ] 🟢 **App** — Hard bounce → mark address invalid, suppress future sends
- [ ] 🟢 **App** — Soft bounce → increment retry counter, suppress after threshold
- [ ] 🟢 **App** — Write tests for bounce classification logic

### 7b. Complaint (FBL) Processing
- [ ] 🖥️ **Server** — Register with Gmail Postmaster Tools
- [ ] 🖥️ **Server** — Register with Microsoft SNDS
- [ ] 🖥️ **Server** — Register with Yahoo Complaint Feedback Loop
- [ ] 🟢 **App** — Build ARF (Abuse Reporting Format) report parser
- [ ] 🟢 **App** — Auto-unsubscribe complaining addresses
- [ ] 🟢 **App** — Log complaints for analytics

### 7c. Suppression List
- [x] 🟢 **App** — Create suppression list database/table
- [x] 🟢 **App** — Populate with hard bounces, complaints, manual unsubscribes
- [ ] 🟢 **App** — Integrate suppression check into queue worker (pre-send)
- [ ] 🟢 **App** — Write tests for suppression list logic

---

## Phase 8: IP Warmup

- [ ] 🟢 **App** — Define warmup schedule (Day 1: 50 → Day 30: 10,000)
- [ ] 🟢 **App** — Implement volume caps in queue worker
- [ ] 🟢 **App** — Prioritize engaged/active recipients during warmup
- [ ] 🟢 **App** — Spread sends evenly throughout the day (no bursts)
- [ ] 🖥️ **Server** — Monitor Gmail Postmaster Tools daily during warmup
- [ ] 🖥️ **Server** — Monitor Microsoft SNDS daily during warmup
- [ ] 🖥️ **Server** — Confirm bounce rate stays below 2%
- [ ] 🖥️ **Server** — Confirm complaint rate stays below 0.1%
- [ ] 🖥️ **Server** — Complete 30-day warmup period

---

## Phase 9: Monitoring & Observability

### 9a. Infrastructure
- [ ] 🖥️ **Server** — Install Prometheus
- [ ] 🖥️ **Server** — Install Grafana
- [ ] 🖥️ **Server** — Install Node Exporter (CPU, RAM, disk metrics)
- [ ] 🖥️ **Server** — Configure Prometheus to scrape all exporters

### 9b. Email Metrics
- [x] 🟢 **App** — Track emails sent per minute (from queue worker)
- [x] 🟢 **App** — Track delivery success rate (from Postfix logs)
- [x] 🟢 **App** — Track bounce rate (from bounce processor)
- [x] 🟢 **App** — Track complaint rate (from FBL processor)
- [ ] 🟢 **App** — Track queue depth (Redis)
- [ ] 🟢 **App** — Track queue latency / oldest job age (Redis)

### 9c. Dashboards & Alerts
- [ ] 🟢 **App** — Create Grafana dashboard for email metrics
- [ ] 🟢 **App** — Create Grafana dashboard for server health
- [ ] 🟢 **App** — Configure alerts: delivery rate < 95%
- [ ] 🟢 **App** — Configure alerts: bounce rate > 2%
- [ ] 🟢 **App** — Configure alerts: complaint rate > 0.1%
- [ ] 🟢 **App** — Configure alerts: queue depth > 10,000
- [ ] 🟢 **App** — Configure alerts: TLS cert expiry < 14 days
- [ ] 🟢 **App** — Configure alerts: Postfix process down
- [ ] 🟢 **App** — Set up alert notifications (Slack / email / PagerDuty)

### 9d. Logging
- [ ] 🖥️ **Server** — Configure structured Postfix logging
- [ ] 🖥️ **Server** — (Optional) Set up centralized log aggregation (Loki or ELK)

---

## Phase 10: EdaPost Application Integration

- [ ] 🟢 **App** — Build internal email sending SDK/library
- [x] 🟢 **App** — Implement `send_email()` interface (to, from, subject, html, text, headers, metadata)
- [x] 🟢 **App** — Implement webhook/status callback system
- [x] 🟢 **App** — Track statuses: queued, sent, delivered, bounced, complained
- [x] 🟢 **App** — Store email events in database for per-email tracking
- [x] 🟢 **App** — Implement email template rendering (HTML + plain text MIME)
- [ ] 🟢 **App** — Inline CSS in HTML templates
- [x] 🟢 **App** — Add `List-Unsubscribe` and `List-Unsubscribe-Post` headers to bulk emails
- [ ] 🟢 **App** — Process unsubscribe requests and update suppression list
- [ ] 🟢 **App** — Write integration tests for end-to-end email flow

---

## Phase 11: Backup & Failover

- [ ] 🖥️ **Server** — Set up secondary sending via Mailgun or SendGrid API
- [ ] 🟢 **App** — Implement automatic failover logic in queue worker
- [ ] 🟢 **App** — Define failover triggers (Postfix down, high bounce rate, IP blacklisted)
- [ ] 🟢 **App** — Implement health-check loop for primary SMTP path
- [ ] 🟢 **App** — Alert team on failover event
- [ ] 🖥️ **Server** — Schedule regular Redis data backups
- [ ] 🖥️ **Server** — Back up Postfix configuration files
- [ ] 🖥️ **Server** — Back up DKIM keys (encrypted, off-server)
- [ ] 🖥️ **Server** — Back up suppression list database
- [ ] 🟢 **App** — Test failover procedure end-to-end

---

## Phase 12: Scaling (Future)

- [ ] 🖥️ **Server** — Plan horizontal scaling architecture (multiple SMTP servers)
- [ ] 🖥️ **Server** — Assign dedicated IPs per server with individual DKIM signing
- [ ] 🟢 **App** — Separate transactional and marketing email onto different IP pools
- [ ] 🖥️ **Server** — Evaluate multi-region deployment for latency and redundancy
- [ ] 🖥️ **Server** — Load test infrastructure at target volume

---

## Notes

- Check off items by changing `[ ]` to `[x]` in this file.
- GitHub will render these as interactive checkboxes in the web UI.
- Update the **Overall Progress** counters at the top when checking off items.
- If a phase is blocked, add a note below the blocked item explaining why.

---

*Last updated: 2026-03-18*
