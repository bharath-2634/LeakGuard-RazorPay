# 🧠 LeakGuard — Validation & AI Recovery Diagnosis Engine

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-v20+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-AI_Diagnosis-8E75B2?style=flat&logo=google&logoColor=white)](https://ai.google.dev/)
[![BullMQ](https://img.shields.io/badge/BullMQ-Event_Worker-DC382D?style=flat&logo=redis&logoColor=white)](https://docs.bullmq.io/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat&logo=prisma&logoColor=white)](https://www.prisma.io/)

---

## 📌 Module Overview

The **Validation & AI Recovery Diagnosis Engine** is the core analytical intelligence module of LeakGuard. When a raw payment failure or checkout drop-off event is emitted by the platform, this service:
1. **Consumes Risk Events**: Listens to the `risk-event-ingestion-queue` via BullMQ background workers.
2. **Evaluates Business Actionability**: Validates whether the payment failure is actionable (e.g. distinguishing between recoverable user/technical issues vs permanent fraud blocks).
3. **Runs Google Gemini AI Diagnosis**: Invokes Gemini AI to analyze raw Razorpay error codes, error descriptions, payment metadata, and telemetry history to determine the exact root-cause failure pattern.
4. **Calculates Actionability & Priority Scores**: Assigns a confidence score (0.00 – 1.00) and priority level (`HIGH`, `MEDIUM`, `LOW`).
5. **Emits Diagnosis Hand-Off Events**: Persists structured `ValidationResult` records in PostgreSQL and pushes `VALIDATION_COMPLETED` events to `intervention-selection-queue` for downstream policy selection and execution.

---

## 🏗️ Architecture & Data Flow

```text
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                     RISK EVENT INGESTION (BullMQ Redis)                     │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │ Risk Event Payload
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                VALIDATION & AI DIAGNOSIS SERVICE WORKER                     │
 │  ┌───────────────────────────────────────────────────────────────────────┐  │
 │  │ 1. Business Actionability Evaluator                                   │  │
 │  │    - Validates business state, merchant status, & fraud signals       │  │
 │  └───────────────────────────────────┬───────────────────────────────────┘  │
 │                                      │
 │                                      ▼
 │  ┌───────────────────────────────────────────────────────────────────────┐  │
 │  │ 2. Google Gemini AI Root Cause Diagnoser                              │  │
 │  │    - Error Code: EXPIRED_CARD, INSUFFICIENT_FUNDS, UPI_TIMEOUT, etc.   │  │
 │  │    - Calculates Confidence Score & Priority Ranking                   │  │
 │  └───────────────────────────────────┬───────────────────────────────────┘  │
 └──────────────────────────────────────┼──────────────────────────────────────┘
                                        │ Structured ValidationResult
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                        PERSISTENCE & HANDOFF BUS                            │
 │  ┌───────────────────────────────────┐ ┌─────────────────────────────────┐  │
 │  │ Cloud Neon PostgreSQL             │ │ BullMQ Intervention Queue       │  │
 │  │ - Saves ValidationResult Record   │ │ - Pushes VALIDATION_COMPLETED   │  │
 │  └───────────────────────────────────┘ └─────────────────────────────────┘  │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Diagnosed Failure Causes & Classification

| Diagnosed Cause | Description | Default Priority | Target Recovery Candidate |
| :--- | :--- | :---: | :--- |
| `EXPIRED_CARD` | Customer card expired prior to transaction | `HIGH` | WhatsApp payment link with card update prompt |
| `INSUFFICIENT_FUNDS` | Account balance insufficient at checkout time | `HIGH` | Scheduled SMS retry / payment link chaser |
| `AUTHENTICATION_FAILED` | 3D-Secure / OTP verification timed out | `MEDIUM` | Email notification with quick-retry button |
| `UPI_TIMEOUT` | UPI PSP app did not approve mandate in time | `HIGH` | Direct payment link via SMS/WhatsApp |
| `CARD_ISSUER_DECLINED` | Issuing bank rejected authorization request | `HIGH` | Alternate payment method suggestion |
| `BANK_SERVER_DOWN` | PSP bank network outage | `MEDIUM` | Delayed retry sequencer |

---

## 🛠️ Technology Stack

- **Runtime**: Node.js v20+, TypeScript (Strict ES2022)
- **AI Model**: Google Gemini API (`@google/genai`)
- **Queue Worker**: BullMQ v5, Redis (Upstash)
- **Database & ORM**: PostgreSQL, Prisma ORM v5.22
- **Validation**: Zod schema validation

---

## 🚀 Step-by-Step Setup & Running Independently

### Prerequisites

- **Node.js**: v20.x or higher
- **Redis**: Upstash cloud instance or local Redis server
- **PostgreSQL**: Neon cloud instance or local database
- **Google Gemini API Key**: Valid API key from Google AI Studio

### Environment Configuration (`.env`)

Create a `.env` file in the module root:

```env
NODE_ENV=development
DATABASE_URL="postgresql://user:password@ep-sample-neon.tech/neondb?sslmode=require"
REDIS_URL="redis://127.0.0.1:6379"
GEMINI_API_KEY="AIzaSyYourGeminiApiKeyHere"
```

### Installation & Execution

```bash
# Navigate to directory
cd ValidationRecoveryDiagnosis

# Install dependencies
npm install

# Push database schema
npx prisma db push

# Build TypeScript
npm run build

# Start Background Worker
npm start
```

### Running Test Suite

```bash
# Run unit tests
npx tsx tests/unit_tests.ts

# Run end-to-end integration tests
npx tsx tests/live_e2e_test.ts
```
