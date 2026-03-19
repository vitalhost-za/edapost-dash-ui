# EdaPost — Self-Hosted Email Infrastructure Dashboard

A modern, full-featured dashboard for managing self-hosted email infrastructure. Built with React, TypeScript, and Supabase, EdaPost provides complete control over SMTP servers, email campaigns, delivery monitoring, bounce handling, and more.

## Features

### Email Operations
- **SMTP Server Management** — Add, configure, and monitor multiple SMTP servers with TLS support, connection pooling, and real-time health checks
- **Email Composer** — Rich HTML editor with merge tag personalization, CSV contact import, attachment support, and desktop/mobile preview
- **Campaign Management** — Create, schedule, pause, and resume email campaigns with timezone-aware scheduling and recurring sends (daily/weekly/monthly)
- **A/B Testing** — Multi-variant subject line and content testing with automatic winner selection based on click-through rate
- **Email Queue** — Real-time queue visualization with batch retry for failed emails

### Deliverability
- **Bounce Processing** — Automatic hard/soft bounce classification with DSN parsing, retry logic, and suppression after threshold
- **Suppression List** — Auto-populated from bounces, complaints, and manual unsubscribes; checked pre-send to prevent delivery to invalid addresses
- **DNS Health Monitoring** — SPF, DKIM, DMARC, MX, and PTR record validation with actionable recommendations
- **Rate Limiting** — Configurable per-domain sending limits (per minute/hour) to protect sender reputation

### Monitoring & Analytics
- **Dashboard Metrics** — Emails sent, delivery rate, bounce rate, complaint rate, and queue depth at a glance
- **Campaign Analytics** — Per-campaign performance: sent, delivered, bounced, opened, clicked, and CTR
- **Delivery Logs** — Complete email history with status filtering, SMTP response codes, and bounce reasons
- **Webhook Tracking** — Event delivery logging with HMAC-SHA256 signature validation and automatic retries

### Templates & Contacts
- **Email Templates** — Reusable HTML + plain text templates with preview
- **Contact Lists** — Bulk CSV import, deduplication, and list management

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript |
| Build | Vite 5 (SWC) |
| UI Components | shadcn-ui (Radix UI) |
| Styling | Tailwind CSS 3 + CSS variables (dark mode) |
| Routing | React Router 6 |
| Server State | TanStack React Query |
| Forms | React Hook Form + Zod |
| Backend | Supabase (PostgreSQL, Auth, Edge Functions) |
| Edge Functions | Deno |
| Charts | Recharts |
| Testing | Vitest + Playwright + React Testing Library |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+ (recommended: install via [nvm](https://github.com/nvm-sh/nvm))
- npm v9+
- A [Supabase](https://supabase.com/) project

### Installation

```sh
# Clone the repository
git clone https://github.com/waleosb/edapost-dash-ui.git
cd edapost-dash-ui

# Install dependencies
npm install

# Start the development server (localhost:8080)
npm run dev
```

### Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 8080 |
| `npm run build` | Production build |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest tests |
| `npm run test:watch` | Run tests in watch mode |

## Project Structure

```
src/
├── pages/              # Route pages (Dashboard, Compose, Campaigns, etc.)
├── components/         # Reusable components + shadcn-ui primitives
│   └── ui/             # 60+ shadcn-ui components
├── hooks/              # Custom React hooks
├── contexts/           # Auth context provider
├── integrations/       # Supabase client & generated types
├── lib/                # Utility functions
├── test/               # Test files
└── assets/             # Static assets

supabase/
├── functions/          # Deno edge functions
│   ├── smtp-worker/              # SMTP email sending & queue processing
│   ├── process-bounces/          # Bounce classification & suppression
│   ├── send-test-email/          # Test email dispatch
│   ├── test-smtp-connection/     # SMTP connectivity validation
│   ├── verify-dns/               # DNS record verification
│   ├── process-scheduled-campaigns/  # Scheduled campaign processing
│   ├── dispatch-webhooks/        # Webhook event delivery
│   └── retry-webhooks/           # Failed webhook retry
└── migrations/         # PostgreSQL schema migrations
```

## Supabase Edge Functions

| Function | Purpose |
|----------|---------|
| `smtp-worker` | Processes the email queue — builds MIME messages, connects via SMTP with TLS/STARTTLS, records delivery results, handles retries with exponential backoff |
| `process-bounces` | Parses DSN reports, classifies hard/soft bounces, auto-suppresses addresses after threshold |
| `send-test-email` | Queues a test email to verify SMTP server configuration |
| `test-smtp-connection` | Validates SMTP server connectivity, authentication, and TLS |
| `verify-dns` | Checks SPF, DKIM, DMARC, MX, and PTR records via Cloudflare DNS API |
| `process-scheduled-campaigns` | Processes due campaigns, handles A/B test distribution and merge tag replacement |
| `dispatch-webhooks` | Delivers webhook events with HMAC-SHA256 signing |
| `retry-webhooks` | Retries failed webhook deliveries with exponential backoff |

## Implementation Progress

See [CHECKLIST.md](./CHECKLIST.md) for a detailed 96-item implementation checklist tracking progress across 12 phases — from server provisioning through scaling.

**Current status:** 37/96 tasks completed (39%)

## License

Private — All rights reserved.
