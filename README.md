# 🛡️ LeakGuard — Revenue Risk Detection Platform, SDK & Merchant Portal

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-v20+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-v19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon_Cloud-4169E1?style=flat&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Redis](https://img.shields.io/badge/Redis-BullMQ-DC382D?style=flat&logo=redis&logoColor=white)](https://redis.io/)

---

## 📌 Module Overview

The **Revenue Risk Detection Platform** forms the front door of the LeakGuard financial recovery engine. It is responsible for:
1. **Client SDK Telemetry Ingestion**: Capturing fail-open telemetry streams (checkout opened, payment method selected, user drop-offs) directly from the merchant's checkout frontend.
2. **Unified Payment Session Management**: Creating tracked payment sessions bound to Razorpay Orders and initializing durable `RevenueObligation` records.
3. **Authentic Razorpay Webhook Ingestion**: Processing `payment.failed`, `payment.authorized`, `payment.captured`, and `order.paid` webhooks with strict HMAC SHA-256 signature verification.
4. **Outbox Event Emission**: Persisting transactionally safe `PAYMENT_FAILURE_RISK` outbox events to trigger downstream diagnosis & orchestration workers.
5. **Merchant Control Plane & Observability APIs**: Serving live metrics (`/v1/recovery-metrics`), recovery statuses (`/v1/recoveries`), merchant emergency stop kill-switches (`/v1/recoveries/:riskEventId/stop`), and audit timeline logs (`/v1/audits`).
6. **Merchant Control Dashboard**: A high-impact React portal providing real-time visibility into active recovery workflows, measured revenue recovered, and complete chronological audit trails.

---

## 🏗️ Architecture & Component Breakdown

```text
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                            FRONTEND / CLIENT SDK                            │
 │  ┌───────────────────────────┐         ┌─────────────────────────────────┐  │
 │  │ Client Checkout Browser   │         │ LeakGuard Merchant Dashboard    │  │
 │  │ (Fail-Open SDK Telemetry) │         │ (Live Controls & Audit Logs)    │  │
 │  └─────────────┬─────────────┘         └────────────────┬────────────────┘  │
 └────────────────┼────────────────────────────────────────┼───────────────────┘
                  │ Telemetry Events                       │ Control & Metrics APIs
                  ▼                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                      PLATFORM API SERVER (Express / Node.js)                │
 │  ┌───────────────────────┐ ┌────────────────────────┐ ┌──────────────────┐  │
 │  │ Payment Session &     │ │ Razorpay Webhook       │ │ Merchant Control │  │
 │  │ Obligation Service    │ │ HMAC Ingestion Engine  │ │ Plane & Metrics  │  │
 │  └───────────┬───────────┘ └───────────┬────────────┘ └────────┬─────────┘  │
 └──────────────┼─────────────────────────┼───────────────────────┼────────────┘
                │                         │                       │
                ▼                         ▼                       ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                           PERSISTENCE & EVENT BUS                           │
 │  ┌─────────────────────────────────────┐ ┌───────────────────────────────┐  │
 │  │ Cloud Neon PostgreSQL (Prisma ORM)  │ │ Upstash Redis (BullMQ Queues) │  │
 │  │ - RevenueObligation (Truth)         │ │ - risk-event-ingestion-queue  │  │
 │  │ - RiskEvent & Outbox                │ │ - execution-measure-queue     │  │
 │  │ - RecoveryControl & RecoveryAudit   │ │                               │  │
 │  └─────────────────────────────────────┘ └───────────────────────────────┘  │
 └─────────────────────────────────────────────────────────────────────────────┘
```

### Directory Structure

- `platform/`: Production Express TypeScript REST API server, Prisma ORM schema, BullMQ queues, and route controllers.
- `frontend/`: Modern Vite + React 19 + Tailwind CSS merchant dashboard application.
- `sdk/`: Lightweight, fail-open TypeScript browser SDK package.

---

## 🛠️ Technology Stack

- **Core Runtime**: Node.js v20+, TypeScript (Strict ES2022)
- **API Framework**: Express.js
- **Database & ORM**: PostgreSQL (Neon Cloud with PgBouncer mode), Prisma ORM v5.22
- **Queueing & Event Bus**: BullMQ v5, Redis (Upstash)
- **Frontend Dashboard**: React 19, Vite 8, Tailwind CSS v4, Lucide Icons
- **Security**: HMAC SHA-256 signature verification, AES-256 credential encryption, CORS protection

---

## 🔌 Core API Endpoints

### 1. Merchant Onboarding & Economics
- `POST /v1/merchants` — Register merchant configuration, margin rates, and Razorpay API key references.
- `GET /v1/merchants/:id` — Retrieve active merchant policies and economic configurations.

### 2. Payment Session & Telemetry
- `POST /v1/payments/session` — Create unified payment session, bind Razorpay order, and generate `paymentAttemptId`.
- `POST /v1/sdk/events` — Ingest asynchronous, fail-open browser telemetry events.

### 3. Webhook Handling
- `POST /v1/webhooks/razorpay` — Validate `x-razorpay-signature` header, update `RevenueObligation` state, and push `PAYMENT_FAILURE_RISK` events to the outbox queue.

### 4. Merchant Recovery Control & Observability
- `GET /v1/recoveries` — List active and historical recovery workflows for a merchant.
- `GET /v1/recoveries/:riskEventId` — Fetch detailed recovery inspection view (attempts, outcomes, control state, audit trail).
- `POST /v1/recoveries/:riskEventId/stop` — **Merchant Emergency Stop Kill-Switch**. Halts recovery workflow in real-time.
- `GET /v1/recovery-metrics` — **Measured Revenue Metrics**. Aggregate total revenue at risk, actual measured recovered revenue, recovery rate %, and channel breakdowns.
- `GET /v1/audits` — Fetch chronological, append-only audit trail logs.

---

## 🚀 Step-by-Step Setup & Running Independently

### Prerequisites

- **Node.js**: v20.x or higher
- **PostgreSQL**: Neon cloud instance or local PostgreSQL (v14+)
- **Redis**: Upstash cloud instance or local Redis (v6+)

### 1. Platform Server Setup

```bash
# Navigate to platform directory
cd RevenueRiskDetectionSDK/platform

# Install dependencies
npm install

# Configure Environment Variables (.env)
cp .env.example .env
```

#### Sample `.env` Configuration:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://user:password@ep-sample-neon.tech/neondb?sslmode=require"
INTERVENTION_REDIS_URL="redis://127.0.0.1:6379"
MASTER_SECRET_KEY="super_secret_master_key_for_aes_encryption"
```

```bash
# Push Prisma Database Schema to PostgreSQL
npx prisma db push

# Generate Prisma Client
npx prisma generate

# Build TypeScript Code
npm run build

# Start Development Server
npm run dev
```

The Platform API server will start on `http://localhost:3000`.

---

### 2. Frontend Dashboard Setup

```bash
# Navigate to frontend directory
cd RevenueRiskDetectionSDK/frontend

# Install dependencies
npm install

# Build & Run Vite Dev Server
npm run dev
```

The Merchant Dashboard will start on `http://localhost:5173`.

---

## 🧪 Verification & Testing

To run the end-to-end Railway production suite verifying session creation, HMAC signature verification, database persistence, and API routes:

```bash
cd RevenueRiskDetectionSDK/platform
npx tsx test_railway_production.ts
```
