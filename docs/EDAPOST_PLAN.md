# EdaPost — Claude Code Development Prompt

## Project Overview

EdaPost is a **self-contained bulk email SaaS platform** (similar to XSender/Mailgun/SendGrid) where users subscribe to a plan and send bulk emails entirely within the platform. Users never leave EdaPost — they sign up, upload contacts, compose emails, launch campaigns, and track results all from the EdaPost dashboard.

**GitHub Repo:** `https://github.com/vitalhost-za/edapost-dash-ui`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript (Vite) |
| Backend/Auth/DB | Supabase (PostgreSQL, Auth, Edge Functions, Realtime) |
| Payment | Paystack (Africa) + PayFast (South Africa) |
| Email Infrastructure | Self-hosted Postfix on Hetzner VPS |
| Queue | Redis (on Hetzner server) |
| Monitoring | Prometheus + Grafana + Node Exporter |
| Spam Filtering | Rspamd |
| DKIM Signing | OpenDKIM |
| Hosting - Frontend | Vercel |
| Hosting - Mail Server | Hetzner CX23 (Nuremberg, Germany) |

---

## Server Infrastructure (Already Configured)

The mail server is fully set up on Hetzner (IP: `46.225.10.27`). Do NOT modify server configs unless explicitly asked.

### What's Running on the Server

- **Postfix** — SMTP server on ports 25 (delivery) and 587 (submission)
- **OpenDKIM** — DKIM signing (selector: `default`, domain: `edapost.net`)
- **Rspamd** — Spam filtering (port 11332)
- **Redis** — Email job queue (port 6379, localhost only)
- **Let's Encrypt TLS** — Valid cert for `mail.edapost.net`
- **Prometheus** — Metrics (port 9090)
- **Grafana** — Dashboards (port 3000)
- **Node Exporter** — System metrics (port 9100)
- **UFW Firewall** — Ports open: 22, 25, 80, 443, 465, 587
- **Node.js 20** + **PM2** — Ready for backend API deployment

### DNS Records (All Verified & Healthy)

- A: `mail.edapost.net` → `46.225.10.27`
- MX: `edapost.net` → `mail.edapost.net` (priority 10)
- SPF: `v=spf1 ip4:46.225.10.27 -all`
- DKIM: `default._domainkey.edapost.net` (2048-bit RSA)
- DMARC: `v=DMARC1; p=quarantine; rua=mailto:dmarc@edapost.net; pct=100`
- PTR: `46.225.10.27` → `mail.edapost.net`

---

## Current State

### What's Built (Frontend)

The dashboard UI is built and deployed on Vercel with these pages:

- **Dashboard** — Overview metrics
- **Servers** — SMTP server management (server added and showing online)
- **Compose** — Email composer
- **Campaigns** — Campaign management
- **Campaign Analytics** — Performance tracking
- **Templates** — Email template library
- **Contact Lists** — Subscriber contact management
- **Queue** — Email queue monitoring
- **Logs** — Delivery logs
- **Bounces** — Bounce tracking
- **Suppression List** — Suppressed email management
- **DNS Health** — DNS record verification (all green, 100% healthy)
- **Analytics** — Sending analytics
- **Monitoring** — Server health monitoring

### What's Built (Backend - Phase 6b & 6c)

- Email API — accepts email payloads, enqueues to Redis, returns job ID
- SMTP Worker — pops jobs from Redis, constructs MIME, submits to Postfix
- Result recording (success, bounce, error)
- Configurable worker concurrency
- Retry logic with exponential backoff
- Unit tests

### What Works End-to-End

- Compose and send emails works through the full pipeline
- Postfix delivers with DKIM signing
- TLS encryption (TLSv1.3)

---

## What Needs to Be Built

### Phase A: Authentication & Multi-Tenancy (Priority: HIGH)

Implement Supabase Auth with multi-tenant isolation.

#### A1: User Registration & Login

```
- Email/password signup with email verification
- OAuth (Google, GitHub) — optional but nice to have
- Login page with "Forgot Password" flow
- Email verification required before accessing dashboard
```

#### A2: User Roles

```
- admin — Full platform access, can see all users, revenue, system health
- subscriber — Can only see their own data (campaigns, contacts, logs, etc.)
- Store role in Supabase user metadata or a profiles table
```

#### A3: Row Level Security (RLS)

```
Every table that stores user data MUST have RLS policies:
- Users can only SELECT, INSERT, UPDATE, DELETE their own rows
- Admin role bypasses RLS for management
- All queries must be scoped to auth.uid()
```

#### A4: Profiles Table

```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  company_name TEXT,
  role TEXT NOT NULL DEFAULT 'subscriber' CHECK (role IN ('admin', 'subscriber')),
  plan_id UUID REFERENCES public.plans(id),
  subscription_status TEXT DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'past_due', 'cancelled')),
  emails_sent_this_month INTEGER DEFAULT 0,
  monthly_email_limit INTEGER DEFAULT 0,
  billing_cycle_start TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admin can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

#### A5: Auto-Create Profile on Signup

```sql
-- Trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    'subscriber'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

### Phase B: Subscription Plans & Billing (Priority: HIGH)

#### B1: Plans Table

```sql
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  monthly_email_limit INTEGER NOT NULL,
  price_monthly INTEGER NOT NULL, -- in cents (ZAR)
  price_yearly INTEGER, -- in cents (ZAR), optional annual discount
  features JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default plans
INSERT INTO public.plans (name, slug, monthly_email_limit, price_monthly, features, sort_order) VALUES
  ('Free', 'free', 500, 0, '["500 emails/month", "1 contact list", "Basic templates", "EdaPost branding"]', 1),
  ('Starter', 'starter', 10000, 29900, '["10,000 emails/month", "5 contact lists", "All templates", "No branding", "Priority support"]', 2),
  ('Pro', 'pro', 50000, 79900, '["50,000 emails/month", "Unlimited contact lists", "Custom templates", "API access", "Dedicated IP option", "Priority support"]', 3),
  ('Enterprise', 'enterprise', 500000, 199900, '["500,000 emails/month", "Unlimited everything", "Custom DKIM", "Dedicated IP", "Account manager", "SLA guarantee"]', 4);
```

#### B2: Subscriptions Table

```sql
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'expired')),
  payment_gateway TEXT CHECK (payment_gateway IN ('paystack', 'payfast')),
  gateway_subscription_id TEXT, -- Paystack/PayFast subscription reference
  gateway_customer_id TEXT,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);
```

#### B3: Usage Tracking Table

```sql
CREATE TABLE public.email_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- '2026-03' format
  emails_sent INTEGER DEFAULT 0,
  emails_delivered INTEGER DEFAULT 0,
  emails_bounced INTEGER DEFAULT 0,
  emails_complained INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, month)
);

-- RLS
ALTER TABLE public.email_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
  ON public.email_usage FOR SELECT
  USING (auth.uid() = user_id);
```

#### B4: Paystack Integration

```
Paystack API Base: https://api.paystack.co

Flow:
1. User selects plan → Frontend calls Supabase Edge Function
2. Edge Function creates Paystack transaction/subscription
3. User completes payment on Paystack checkout
4. Paystack sends webhook to your Edge Function
5. Edge Function activates subscription in database
6. User can now send emails up to their plan limit

Required Edge Functions:
- create-subscription: Initialize Paystack subscription
- paystack-webhook: Handle payment events (charge.success, subscription.create, subscription.disable, invoice.payment_failed)
- cancel-subscription: Cancel at end of period

Environment Variables (set in Supabase Dashboard → Edge Functions → Secrets):
- PAYSTACK_SECRET_KEY
- PAYSTACK_PUBLIC_KEY
- PAYSTACK_WEBHOOK_SECRET
```

#### B5: PayFast Integration

```
PayFast API Base: https://www.payfast.co.za

Flow:
1. User selects plan → Generate PayFast payment form
2. User redirected to PayFast for payment
3. PayFast sends ITN (Instant Transaction Notification) to your webhook
4. Edge Function validates signature and activates subscription

Required Edge Functions:
- create-payfast-subscription: Generate payment parameters with signature
- payfast-itn: Handle Instant Transaction Notifications

Environment Variables:
- PAYFAST_MERCHANT_ID
- PAYFAST_MERCHANT_KEY
- PAYFAST_PASSPHRASE
```

#### B6: Enforce Sending Limits

```
Before every email send, check:
1. User has active subscription
2. User has not exceeded monthly_email_limit
3. If limit reached, reject with clear error message
4. Increment emails_sent_this_month counter

Reset counters monthly (use Supabase cron or pg_cron):

SELECT cron.schedule(
  'reset-monthly-email-counts',
  '0 0 1 * *', -- First day of each month at midnight
  $$UPDATE public.profiles SET emails_sent_this_month = 0$$
);
```

---

### Phase C: Multi-Tenant Data Isolation (Priority: HIGH)

Every user-facing table MUST scope data to the authenticated user.

#### Tables That Need RLS

```
- campaigns (user_id)
- contact_lists (user_id)
- contacts (user_id)
- templates (user_id + shared system templates)
- email_logs (user_id)
- bounces (user_id)
- suppression_list (user_id)
- email_usage (user_id)
- subscriptions (user_id)
```

#### RLS Pattern for All Tables

```sql
-- Enable RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Subscriber sees own data
CREATE POLICY "Users can CRUD own campaigns"
  ON public.campaigns FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin sees all data
CREATE POLICY "Admin full access to campaigns"
  ON public.campaigns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

---

### Phase D: Frontend Pages to Build/Update (Priority: MEDIUM)

#### D1: Public Pages (No Auth Required)

```
/                   — Landing page (marketing, features, pricing)
/pricing            — Plan comparison with signup CTAs
/login              — Login form
/signup             — Registration form
/forgot-password    — Password reset
/verify-email       — Email verification
```

#### D2: Subscriber Dashboard (Auth Required, role=subscriber)

```
/dashboard          — Personal sending stats, plan usage meter
/compose            — Email composer (scoped to user's contacts)
/campaigns          — User's campaigns only
/campaigns/:id      — Campaign detail with analytics
/contact-lists      — User's contact lists
/templates          — User's templates + system templates
/logs               — User's email logs
/bounces            — User's bounces
/suppression-list   — User's suppressed addresses
/analytics          — User's sending analytics
/settings           — Account settings
/settings/billing   — Plan management, upgrade/downgrade, invoices
/settings/api       — API key management (Pro/Enterprise plans)
```

#### D3: Admin Dashboard (Auth Required, role=admin)

```
/admin              — Platform overview (total users, revenue, emails sent)
/admin/users        — All users, their plans, usage, status
/admin/users/:id    — Individual user detail
/admin/servers      — SMTP server management
/admin/dns-health   — DNS health checker
/admin/monitoring   — Server health (Prometheus/Grafana)
/admin/queue        — Global email queue
/admin/logs         — All email logs
/admin/bounces      — All bounces
/admin/revenue      — Revenue dashboard
/admin/plans        — Manage plans and pricing
```

#### D4: Plan Usage Meter Component

```
Build a reusable component that shows:
- Current plan name
- Emails sent / Monthly limit (progress bar)
- Percentage used
- "Upgrade" button when approaching limit (>80%)
- Warning state at 90%, blocked at 100%
- Display on dashboard and in compose page header
```

---

### Phase E: API Key System (Priority: LOW — Pro/Enterprise Plans)

```
Allow Pro/Enterprise subscribers to generate API keys for programmatic sending.

Table:
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL, -- bcrypt hash of the API key
  key_prefix TEXT NOT NULL, -- first 8 chars for identification (e.g., "ep_live_a1b2...")
  name TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

API Endpoint: POST https://mail.edapost.net/api/v1/send
Headers: Authorization: Bearer ep_live_xxxxxxxxxxxx
Body: { to, from, subject, html, text, headers }
```

---

### Phase F: Landing Page & Marketing (Priority: MEDIUM)

```
Build a public-facing landing page at edapost.net with:

1. Hero section — "Send Bulk Emails That Actually Get Delivered"
2. Features section — Highlight self-hosted infrastructure, DKIM, SPF, deliverability
3. Pricing section — Show plans from Phase B
4. How it works — 3-step: Sign up → Upload contacts → Send campaigns
5. Trust signals — DNS health score, TLS encryption, DKIM signing
6. CTA — "Start Free" button leading to /signup
7. Footer — Links, legal, contact
```

---

## Development Guidelines

### Code Standards

```
- TypeScript strict mode
- React functional components with hooks
- Tailwind CSS for styling (already configured)
- shadcn/ui components (already installed)
- Supabase client via @supabase/supabase-js
- All database operations through Supabase client (never raw SQL from frontend)
- Error handling on every async operation
- Loading states on all data fetches
- Toast notifications for user feedback (success/error)
```

### File Structure

```
src/
├── components/
│   ├── auth/           — Login, Signup, ProtectedRoute
│   ├── billing/        — PlanCard, SubscriptionManager, UsageMeter
│   ├── campaigns/      — CampaignList, CampaignDetail, CampaignBuilder
│   ├── compose/        — EmailComposer, TemplateSelector
│   ├── contacts/       — ContactList, ImportContacts, ContactGroups
│   ├── layout/         — Sidebar, Header, AdminLayout, SubscriberLayout
│   └── shared/         — Reusable UI components
├── hooks/
│   ├── useAuth.ts      — Auth state and methods
│   ├── useSubscription.ts — Plan and billing state
│   ├── useUsage.ts     — Email usage tracking
│   └── useRole.ts      — Role-based access control
├── lib/
│   ├── supabase.ts     — Supabase client
│   ├── paystack.ts     — Paystack integration helpers
│   └── payfast.ts      — PayFast integration helpers
├── pages/
│   ├── public/         — Landing, Pricing, Login, Signup
│   ├── subscriber/     — Subscriber dashboard pages
│   └── admin/          — Admin dashboard pages
└── types/
    └── database.ts     — Supabase generated types
```

### Environment Variables

```
# Supabase
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Paystack (public key for frontend)
VITE_PAYSTACK_PUBLIC_KEY=pk_live_xxx

# PayFast
VITE_PAYFAST_MERCHANT_ID=xxx

# API
VITE_API_BASE_URL=https://mail.edapost.net/api
```

### Supabase Edge Function Secrets

```
# Set these in Supabase Dashboard → Edge Functions → Secrets
PAYSTACK_SECRET_KEY=sk_live_xxx
PAYSTACK_WEBHOOK_SECRET=whsec_xxx
PAYFAST_MERCHANT_KEY=xxx
PAYFAST_PASSPHRASE=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

---

## Implementation Order

```
1. Phase A — Authentication (signup, login, profiles, RLS)
2. Phase B1-B3 — Plans table, subscriptions table, usage tracking
3. Phase C — RLS policies on all existing tables
4. Phase D1 — Public pages (landing, login, signup, pricing)
5. Phase D2 — Subscriber dashboard with role-based routing
6. Phase D3 — Admin dashboard
7. Phase B4-B5 — Payment integration (Paystack + PayFast)
8. Phase B6 — Enforce sending limits
9. Phase D4 — Usage meter component
10. Phase E — API key system (Pro/Enterprise)
11. Phase F — Landing page polish
```

---

## Important Notes

- The mail server infrastructure is **fully configured and working**. Do not modify Postfix, OpenDKIM, Rspamd, or Redis configs.
- The SMTP Worker and Email API backend are **already built and deployed** on the Hetzner server.
- Supabase is used for **everything except email sending** — auth, database, edge functions, realtime.
- Emails are sent through **your own Postfix server** (mail.edapost.net), not through any third-party service.
- The domain is `edapost.net`, the mail server hostname is `mail.edapost.net`.
- Payment is in **South African Rand (ZAR)** — prices in the plans table are in cents.
- The platform serves **African markets primarily** — Paystack and PayFast are the correct payment gateways.
