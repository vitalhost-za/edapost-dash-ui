# EdaPost — Self-Hosted SMTP Infrastructure: Project Implementation Plan

> This document breaks down every phase of building EdaPost's self-hosted email infrastructure into actionable steps. Each phase must be completed and verified before moving to the next.

---

## Phase 1: Server Provisioning & Base Setup

### 1.1 Provision a Dedicated VPS
- Select a VPS provider (DigitalOcean, Vultr, or Linode).
- Provision a server with minimum specs: **2 vCPU, 4 GB RAM, Ubuntu 22.04 LTS**.
- Ensure the server has a **static/dedicated IPv4 address**.
- Verify that the provider does **not block outbound port 25** (required for SMTP). Some providers block it by default and require a support request.

### 1.2 Initial Server Hardening
- Create a non-root sudo user.
- Disable root SSH login and password authentication; use SSH key-only access.
- Configure the hostname to `mail.edapost.net`.
  ```bash
  sudo hostnamectl set-hostname mail.edapost.net
  ```
- Set the server timezone to UTC.
- Run full system update:
  ```bash
  sudo apt update && sudo apt upgrade -y
  ```

### 1.3 Firewall Configuration
- Install and enable UFW (Uncomplicated Firewall).
- Allow the following ports:
  | Port | Protocol | Purpose |
  |------|----------|---------|
  | 22   | TCP      | SSH |
  | 25   | TCP      | SMTP |
  | 465  | TCP      | SMTPS (implicit TLS) |
  | 587  | TCP      | Submission (STARTTLS) |
  | 80   | TCP      | HTTP (Let's Encrypt validation) |
  | 443  | TCP      | HTTPS (management/monitoring) |
- Deny all other inbound traffic by default.
- Enable rate limiting on SSH.

---

## Phase 2: DNS Configuration

### 2.1 Domain DNS Records
Configure the following records in your domain registrar / DNS provider for `edapost.net`:

| Type  | Name                   | Value |
|-------|------------------------|-------|
| A     | `mail.edapost.net`     | `<SERVER_IP>` |
| MX    | `edapost.net`          | `mail.edapost.net` (priority 10) |
| PTR   | (reverse DNS)          | `mail.edapost.net` — set via VPS provider |

### 2.2 SPF Record
- Add a TXT record on `edapost.net`:
  ```
  v=spf1 ip4:<SERVER_IP> -all
  ```

### 2.3 DKIM Record
- Will be created after OpenDKIM key generation (Phase 3).
- Placeholder: TXT record at `default._domainkey.edapost.net`.

### 2.4 DMARC Record
- Add a TXT record on `_dmarc.edapost.net`:
  ```
  v=DMARC1; p=quarantine; rua=mailto:admin@edapost.net; ruf=mailto:admin@edapost.net; fo=1
  ```

### 2.5 Verification
- Verify all DNS records propagate correctly using `dig` or an online DNS checker.
- Confirm reverse DNS (PTR) resolves `<SERVER_IP>` → `mail.edapost.net`.

---

## Phase 3: Postfix SMTP Server Installation & Configuration

### 3.1 Install Postfix
```bash
sudo apt update
sudo apt install postfix mailutils -y
```
- Select **Internet Site** during installation.
- Set system mail name to `edapost.net`.

### 3.2 Core Postfix Configuration (`/etc/postfix/main.cf`)
- Set `myhostname = mail.edapost.net`
- Set `mydomain = edapost.net`
- Set `myorigin = $mydomain`
- Set `inet_interfaces = all`
- Set `mydestination = $myhostname, localhost.$mydomain, localhost`
- Configure relay restrictions to prevent open relay:
  ```
  smtpd_relay_restrictions = permit_mynetworks, permit_sasl_authenticated, defer_unauth_destination
  ```
- Set message size limit (e.g., 25 MB):
  ```
  message_size_limit = 26214400
  ```

### 3.3 Configure Submission Port (587)
- Edit `/etc/postfix/master.cf` to enable the submission service on port 587 with STARTTLS.

### 3.4 Test Basic Mail Sending
- Send a test email using `mail` command.
- Verify delivery and check mail logs (`/var/log/mail.log`).

---

## Phase 4: TLS Encryption (Let's Encrypt)

### 4.1 Install Certbot
```bash
sudo apt install certbot -y
```

### 4.2 Obtain TLS Certificate
```bash
sudo certbot certonly --standalone -d mail.edapost.net
```

### 4.3 Configure Postfix TLS
Add to `/etc/postfix/main.cf`:
```
smtpd_tls_cert_file = /etc/letsencrypt/live/mail.edapost.net/fullchain.pem
smtpd_tls_key_file = /etc/letsencrypt/live/mail.edapost.net/privkey.pem
smtpd_tls_security_level = may
smtp_tls_security_level = may
smtpd_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1
smtp_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1
```

### 4.4 Auto-Renewal
- Set up a cron job or systemd timer for automatic certificate renewal.
- Add a post-renewal hook to reload Postfix:
  ```bash
  sudo certbot renew --post-hook "systemctl reload postfix"
  ```

### 4.5 Verification
- Test TLS with `openssl s_client -starttls smtp -connect mail.edapost.net:587`.

---

## Phase 5: DKIM Signing (OpenDKIM)

### 5.1 Install OpenDKIM
```bash
sudo apt install opendkim opendkim-tools -y
```

### 5.2 Generate DKIM Keys
```bash
sudo mkdir -p /etc/opendkim/keys/edapost.net
sudo opendkim-genkey -d edapost.net -s default -D /etc/opendkim/keys/edapost.net
sudo chown -R opendkim:opendkim /etc/opendkim
```

### 5.3 Configure OpenDKIM
- Edit `/etc/opendkim.conf`:
  - Set `Domain edapost.net`
  - Set `Selector default`
  - Set `KeyFile /etc/opendkim/keys/edapost.net/default.private`
  - Set `Socket inet:8891@localhost`
- Create signing table and key table files.

### 5.4 Integrate with Postfix
Add to `/etc/postfix/main.cf`:
```
milter_default_action = accept
milter_protocol = 6
smtpd_milters = inet:localhost:8891
non_smtpd_milters = inet:localhost:8891
```

### 5.5 Publish DKIM DNS Record
- Read the public key from `/etc/opendkim/keys/edapost.net/default.txt`.
- Add it as a TXT record at `default._domainkey.edapost.net`.

### 5.6 Verification
- Send a test email and inspect headers for `DKIM-Signature`.
- Use an online DKIM validator.

---

## Phase 6: Email Queue System (Redis + Worker)

### 6.1 Install Redis
```bash
sudo apt install redis-server -y
```
- Configure Redis to bind to `127.0.0.1` only.
- Enable Redis persistence (AOF or RDB) to prevent queue loss on restart.

### 6.2 Design the Queue Architecture
```
EdaPost App
     │
     │  (enqueue email job via API)
     ▼
Redis Queue (email_queue)
     │
     ▼
SMTP Worker Process(es)
     │
     │  (submit via localhost:25)
     ▼
Postfix → Internet
```

### 6.3 Implement the EdaPost Email API
- Create an internal API endpoint that accepts email payloads (to, from, subject, body, headers).
- On receipt, push the email job as a JSON message onto the Redis queue.
- Return a job ID to the caller for tracking.

### 6.4 Implement SMTP Worker(s)
- Build a worker process that:
  1. Pops jobs from the Redis queue.
  2. Constructs the email (MIME).
  3. Submits it to Postfix via `localhost:25` or `localhost:587`.
  4. Records the result (success, bounce, error) back into a result store.
- Support configurable concurrency (number of worker threads/processes).
- Implement retry logic with exponential backoff for transient failures.

### 6.5 Rate Limiting
- Implement per-domain sending rate limits within the worker to respect provider throttling (e.g., Gmail limits).
- Make rate limits configurable.

### 6.6 Testing
- Send test batches through the queue.
- Verify delivery, ordering, and error handling.

---

## Phase 7: Bounce & Complaint Handling

### 7.1 Install Rspamd
```bash
sudo apt install rspamd -y
```
- Integrate Rspamd with Postfix as a milter for spam filtering on inbound feedback.

### 7.2 Bounce Processing
- Configure Postfix to send bounce notifications to a dedicated address (e.g., `bounces@edapost.net`).
- Build or configure a bounce processor that:
  1. Parses DSN (Delivery Status Notification) messages.
  2. Classifies bounces as **hard** (permanent) or **soft** (temporary).
  3. Updates the EdaPost database:
     - Hard bounce → mark address as invalid, suppress future sends.
     - Soft bounce → increment retry counter, suppress after threshold (e.g., 3 consecutive soft bounces).

### 7.3 Complaint (FBL) Processing
- Register for Feedback Loops with major providers (Gmail Postmaster Tools, Microsoft SNDS, Yahoo CFL).
- Build a processor that:
  1. Receives ARF (Abuse Reporting Format) reports.
  2. Automatically unsubscribes the complaining address.
  3. Logs the complaint for analytics.

### 7.4 Suppression List
- Maintain a global suppression list of:
  - Hard-bounced addresses
  - Complaint addresses
  - Manual unsubscribes
- The queue worker must check this list **before** sending any email.

---

## Phase 8: IP Warmup

### 8.1 Create a Warmup Schedule
Follow a gradual ramp-up plan:

| Day   | Daily Email Volume |
|-------|--------------------|
| 1–2   | 50                 |
| 3–4   | 100                |
| 5–7   | 200                |
| 8–10  | 500                |
| 11–14 | 1,000              |
| 15–21 | 2,000              |
| 22–28 | 5,000              |
| 29–30 | 10,000             |

### 8.2 Implementation
- Implement warmup volume caps in the queue worker.
- Prioritize sending to engaged/active recipients during warmup (higher chance of opens → positive reputation signal).
- Spread sends evenly throughout the day (avoid bursts).

### 8.3 Monitor During Warmup
- Check Gmail Postmaster Tools, Microsoft SNDS daily.
- Watch bounce rates (must stay below 2%) and complaint rates (must stay below 0.1%).
- If rates spike, pause sending and investigate.

---

## Phase 9: Monitoring & Observability

### 9.1 Install Prometheus
```bash
# Use official Prometheus installation or Docker
sudo apt install prometheus -y
```

### 9.2 Install Grafana
```bash
sudo apt install grafana -y
```

### 9.3 Metrics to Collect
Configure exporters and dashboards for:

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Emails sent/min | Queue worker | — |
| Delivery success rate | Postfix logs | < 95% |
| Bounce rate | Bounce processor | > 2% |
| Complaint rate | FBL processor | > 0.1% |
| Queue depth | Redis | > 10,000 |
| Queue latency (age of oldest job) | Redis | > 5 min |
| Server CPU / RAM / Disk | Node exporter | > 80% |
| TLS certificate expiry | Blackbox exporter | < 14 days |
| Postfix process health | Process exporter | down |

### 9.4 Alerting
- Configure Grafana alerts or Alertmanager to send notifications (Slack, email, PagerDuty) when thresholds are breached.

### 9.5 Log Aggregation
- Configure Postfix to log to a structured format.
- Optionally set up Loki or ELK for centralized log search.

---

## Phase 10: EdaPost Application Integration

### 10.1 Internal Email Sending SDK/Library
- Build a client library that EdaPost's application code uses to send emails.
- Interface:
  ```
  send_email(to, from, subject, html_body, text_body, headers, metadata)
  → returns job_id
  ```
- The library enqueues into Redis; it does **not** talk to Postfix directly.

### 10.2 Webhook / Status Callback System
- Implement a webhook system so EdaPost can track:
  - `queued` — job accepted into queue
  - `sent` — successfully handed to Postfix
  - `delivered` — confirmed delivery (if DSN available)
  - `bounced` — hard or soft bounce
  - `complained` — spam complaint received
- Store events in a database table for per-email status tracking.

### 10.3 Template Rendering
- If EdaPost uses email templates, ensure the rendering pipeline outputs valid MIME (HTML + plain text parts).
- Inline CSS for maximum email client compatibility.

### 10.4 Unsubscribe Handling
- Include `List-Unsubscribe` and `List-Unsubscribe-Post` headers in all marketing/bulk emails (required by Gmail and Yahoo as of 2024).
- Process unsubscribe requests and update the suppression list.

---

## Phase 11: Backup & Failover Strategy

### 11.1 Configure Backup Email Provider
- Set up a secondary sending path through **Mailgun** or **SendGrid**.
- The queue worker should automatically failover to the backup provider if:
  - Postfix is unreachable.
  - Bounce rate exceeds a critical threshold.
  - The primary IP gets blacklisted.

### 11.2 Automated Failover Logic
- Implement a health-check loop that monitors the primary SMTP path.
- On failure, route new emails through the backup API.
- Alert the team immediately on failover.

### 11.3 Data Backups
- Back up Redis data (queue state) regularly.
- Back up Postfix configuration files.
- Back up DKIM keys securely (encrypted, off-server).
- Back up the suppression list database.

---

## Phase 12: Scaling (Future Growth)

### 12.1 Horizontal Scaling
- When volume exceeds single-server capacity (~50K–100K emails/day), add additional SMTP servers behind a load-balanced queue.
- Each server should have its own dedicated IP and DKIM signing.

### 12.2 Dedicated IP Pools
- Separate transactional email (password resets, receipts) and marketing email onto different IPs.
- This prevents marketing reputation issues from affecting transactional delivery.

### 12.3 Multi-Region Deployment
- Deploy SMTP servers in multiple regions to reduce latency and improve redundancy.

---

## Phase Summary & Dependencies

```
Phase 1  (Server)
   ↓
Phase 2  (DNS)
   ↓
Phase 3  (Postfix)
   ↓
Phase 4  (TLS) ←──── depends on DNS A record
   ↓
Phase 5  (DKIM) ←─── depends on Postfix + DNS
   ↓
Phase 6  (Queue) ←── depends on Postfix
   ↓
Phase 7  (Bounces) ← depends on Queue + Postfix
   ↓
Phase 8  (Warmup) ←─ depends on all above
   ↓
Phase 9  (Monitoring)
   ↓
Phase 10 (App Integration)
   ↓
Phase 11 (Failover)
   ↓
Phase 12 (Scaling) ← future phase
```

---

*This document is the single source of truth for EdaPost's email infrastructure buildout. Update it as decisions are made and phases are completed.*
