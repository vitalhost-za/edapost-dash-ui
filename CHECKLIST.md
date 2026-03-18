# EdaPost — Implementation Checklist

> **How this checklist works:** Mark each item with `[x]` as it is completed. The progress bars below each phase update automatically when rendered by GitHub or any Markdown processor that supports task lists. To track overall progress, count completed items against the total.

---

## Overall Progress

<!-- Update these counters as items are checked off -->
- **Total tasks:** 96
- **Completed:** 0
- **Remaining:** 96

---

## Phase 1: Server Provisioning & Base Setup

- [ ] Select VPS provider (DigitalOcean / Vultr / Linode)
- [ ] Provision server (2 vCPU, 4 GB RAM, Ubuntu 22.04, static IP)
- [ ] Confirm outbound port 25 is not blocked by provider
- [ ] Create non-root sudo user
- [ ] Configure SSH key-only authentication
- [ ] Disable root SSH login and password authentication
- [ ] Set hostname to `mail.edapost.net`
- [ ] Set timezone to UTC
- [ ] Run full system update (`apt update && apt upgrade`)
- [ ] Install and enable UFW firewall
- [ ] Allow ports: 22, 25, 465, 587, 80, 443
- [ ] Deny all other inbound traffic
- [ ] Enable SSH rate limiting

---

## Phase 2: DNS Configuration

- [ ] Create A record: `mail.edapost.net` → server IP
- [ ] Create MX record: `edapost.net` → `mail.edapost.net` (priority 10)
- [ ] Set PTR (reverse DNS) via VPS provider: server IP → `mail.edapost.net`
- [ ] Add SPF TXT record: `v=spf1 ip4:<SERVER_IP> -all`
- [ ] Add DMARC TXT record on `_dmarc.edapost.net`
- [ ] Verify all DNS records with `dig` or online checker
- [ ] Confirm PTR record resolves correctly

---

## Phase 3: Postfix SMTP Server

- [ ] Install Postfix and mailutils
- [ ] Configure `/etc/postfix/main.cf` (hostname, domain, origin, interfaces)
- [ ] Configure relay restrictions (prevent open relay)
- [ ] Set message size limit
- [ ] Enable submission port 587 in `/etc/postfix/master.cf`
- [ ] Restart and enable Postfix service
- [ ] Send test email via `mail` command
- [ ] Verify delivery in `/var/log/mail.log`

---

## Phase 4: TLS Encryption

- [ ] Install Certbot
- [ ] Obtain TLS certificate for `mail.edapost.net`
- [ ] Configure Postfix TLS settings in `main.cf`
- [ ] Disable insecure protocols (SSLv2, SSLv3, TLSv1, TLSv1.1)
- [ ] Set up automatic certificate renewal (cron/systemd timer)
- [ ] Add post-renewal hook to reload Postfix
- [ ] Verify TLS with `openssl s_client`

---

## Phase 5: DKIM Signing

- [ ] Install OpenDKIM and opendkim-tools
- [ ] Generate DKIM key pair for `edapost.net`
- [ ] Configure `/etc/opendkim.conf` (domain, selector, key file, socket)
- [ ] Create signing table and key table files
- [ ] Integrate OpenDKIM with Postfix (milter settings in `main.cf`)
- [ ] Publish DKIM public key as DNS TXT record at `default._domainkey.edapost.net`
- [ ] Restart OpenDKIM and Postfix services
- [ ] Send test email and verify `DKIM-Signature` header
- [ ] Validate DKIM with an online checker

---

## Phase 6: Email Queue System

### 6a. Redis Installation
- [ ] Install Redis server
- [ ] Bind Redis to `127.0.0.1` only
- [ ] Enable Redis persistence (AOF or RDB)
- [ ] Test Redis connectivity

### 6b. Email API
- [ ] Design email job payload schema (to, from, subject, body, headers, metadata)
- [ ] Implement internal API endpoint to accept email payloads
- [ ] Implement enqueue logic (push JSON job to Redis queue)
- [ ] Return job ID to caller
- [ ] Write unit tests for the email API

### 6c. SMTP Worker
- [ ] Implement worker that pops jobs from Redis queue
- [ ] Implement MIME email construction
- [ ] Implement submission to Postfix (localhost:25 or 587)
- [ ] Implement result recording (success, bounce, error)
- [ ] Add configurable worker concurrency
- [ ] Implement retry logic with exponential backoff
- [ ] Write unit tests for the worker

### 6d. Rate Limiting
- [ ] Implement per-domain sending rate limits
- [ ] Make rate limits configurable
- [ ] Test rate limiting under load

---

## Phase 7: Bounce & Complaint Handling

### 7a. Bounce Processing
- [ ] Install Rspamd and integrate with Postfix
- [ ] Configure dedicated bounce address (`bounces@edapost.net`)
- [ ] Build DSN (Delivery Status Notification) parser
- [ ] Classify bounces: hard vs. soft
- [ ] Hard bounce → mark address invalid, suppress future sends
- [ ] Soft bounce → increment retry counter, suppress after threshold
- [ ] Write tests for bounce classification logic

### 7b. Complaint (FBL) Processing
- [ ] Register with Gmail Postmaster Tools
- [ ] Register with Microsoft SNDS
- [ ] Register with Yahoo Complaint Feedback Loop
- [ ] Build ARF (Abuse Reporting Format) report parser
- [ ] Auto-unsubscribe complaining addresses
- [ ] Log complaints for analytics

### 7c. Suppression List
- [ ] Create suppression list database/table
- [ ] Populate with hard bounces, complaints, manual unsubscribes
- [ ] Integrate suppression check into queue worker (pre-send)
- [ ] Write tests for suppression list logic

---

## Phase 8: IP Warmup

- [ ] Define warmup schedule (Day 1: 50 → Day 30: 10,000)
- [ ] Implement volume caps in queue worker
- [ ] Prioritize engaged/active recipients during warmup
- [ ] Spread sends evenly throughout the day (no bursts)
- [ ] Monitor Gmail Postmaster Tools daily during warmup
- [ ] Monitor Microsoft SNDS daily during warmup
- [ ] Confirm bounce rate stays below 2%
- [ ] Confirm complaint rate stays below 0.1%
- [ ] Complete 30-day warmup period

---

## Phase 9: Monitoring & Observability

### 9a. Infrastructure
- [ ] Install Prometheus
- [ ] Install Grafana
- [ ] Install Node Exporter (CPU, RAM, disk metrics)
- [ ] Configure Prometheus to scrape all exporters

### 9b. Email Metrics
- [ ] Track emails sent per minute (from queue worker)
- [ ] Track delivery success rate (from Postfix logs)
- [ ] Track bounce rate (from bounce processor)
- [ ] Track complaint rate (from FBL processor)
- [ ] Track queue depth (Redis)
- [ ] Track queue latency / oldest job age (Redis)

### 9c. Dashboards & Alerts
- [ ] Create Grafana dashboard for email metrics
- [ ] Create Grafana dashboard for server health
- [ ] Configure alerts: delivery rate < 95%
- [ ] Configure alerts: bounce rate > 2%
- [ ] Configure alerts: complaint rate > 0.1%
- [ ] Configure alerts: queue depth > 10,000
- [ ] Configure alerts: TLS cert expiry < 14 days
- [ ] Configure alerts: Postfix process down
- [ ] Set up alert notifications (Slack / email / PagerDuty)

### 9d. Logging
- [ ] Configure structured Postfix logging
- [ ] (Optional) Set up centralized log aggregation (Loki or ELK)

---

## Phase 10: EdaPost Application Integration

- [ ] Build internal email sending SDK/library
- [ ] Implement `send_email()` interface (to, from, subject, html, text, headers, metadata)
- [ ] Implement webhook/status callback system
- [ ] Track statuses: queued, sent, delivered, bounced, complained
- [ ] Store email events in database for per-email tracking
- [ ] Implement email template rendering (HTML + plain text MIME)
- [ ] Inline CSS in HTML templates
- [ ] Add `List-Unsubscribe` and `List-Unsubscribe-Post` headers to bulk emails
- [ ] Process unsubscribe requests and update suppression list
- [ ] Write integration tests for end-to-end email flow

---

## Phase 11: Backup & Failover

- [ ] Set up secondary sending via Mailgun or SendGrid API
- [ ] Implement automatic failover logic in queue worker
- [ ] Define failover triggers (Postfix down, high bounce rate, IP blacklisted)
- [ ] Implement health-check loop for primary SMTP path
- [ ] Alert team on failover event
- [ ] Schedule regular Redis data backups
- [ ] Back up Postfix configuration files
- [ ] Back up DKIM keys (encrypted, off-server)
- [ ] Back up suppression list database
- [ ] Test failover procedure end-to-end

---

## Phase 12: Scaling (Future)

- [ ] Plan horizontal scaling architecture (multiple SMTP servers)
- [ ] Assign dedicated IPs per server with individual DKIM signing
- [ ] Separate transactional and marketing email onto different IP pools
- [ ] Evaluate multi-region deployment for latency and redundancy
- [ ] Load test infrastructure at target volume

---

## Notes

- Check off items by changing `[ ]` to `[x]` in this file.
- GitHub will render these as interactive checkboxes in the web UI.
- Update the **Overall Progress** counters at the top when checking off items.
- If a phase is blocked, add a note below the blocked item explaining why.

---

*Last updated: 2026-03-16*
