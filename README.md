# ⚙️ LeakGuard — Select Intervention & Pipeline Orchestration Engine

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-v20+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Twilio](https://img.shields.io/badge/Twilio-WhatsApp_&_SMS-F22F46?style=flat&logo=twilio&logoColor=white)](https://www.twilio.com/)
[![Resend](https://img.shields.io/badge/Resend-Email_Delivery-000000?style=flat&logo=resend&logoColor=white)](https://resend.com/)
[![Razorpay](https://img.shields.io/badge/Razorpay-Payment_Links-0C2340?style=flat&logo=razorpay&logoColor=white)](https://razorpay.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon_Cloud-4169E1?style=flat&logo=postgresql&logoColor=white)](https://neon.tech/)

---

## 📌 Module Overview

The **Select Intervention & Pipeline Orchestration Engine** is the execution and governance core of LeakGuard. It receives diagnosed payment failure events and safely guides them through intervention selection, policy enforcement, multi-channel side-effect execution, revenue resolution monitoring, and audit logging.

### Core Lifecycle Phases:

1. **Intervention Selection**: Matches diagnosed causes (`EXPIRED_CARD`, `INSUFFICIENT_FUNDS`, `AUTHENTICATION_FAILED`, `UPI_TIMEOUT`) against versioned intervention candidates (`SEND_WHATSAPP`, `SEND_SMS`, `SEND_EMAIL`, `SEND_PAYMENT_LINK`).
2. **Policy & Compliance Evaluation**: Enforces TRAI/DND rules, global retry defaults (max 3 attempts), channel-specific cool-off windows (e.g. 1800s), and merchant configuration checks.
3. **Pre-Execution Safety Check**: Performs a real-time PostgreSQL check (`runFinalSafetyCheckAsync`) milliseconds before firing external API calls to ensure the merchant has not triggered an emergency kill-switch or the customer has not already paid.
4. **Multi-Channel Side-Effect Execution**: Calls external delivery providers:
   - **Twilio**: WhatsApp templates & SMS notifications with custom payment variables.
   - **Resend**: Transactional emails with action buttons.
   - **Razorpay**: Direct payment link creation & webhook tracking.
5. **Outcome Resolution & Measurement**: Periodically monitors `RevenueObligation` status in PostgreSQL. Marks outcome as `RECOVERED` **only when payment is authoritatively settled** (`RevenueObligation = RESOLVED`).
6. **Reassessment & Continuation Loop**: If an attempt expires without payment, evaluates whether to continue recovery or halt, emitting `REASSESSMENT_REQUESTED` events.
7. **Immutable Audit Logging**: Writes every state transition, policy decision, provider response, and merchant stop to `RecoveryAudit`.

---

## 🏗️ Architecture & Subsystem Blueprint

```text
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                DIAGNOSED EVENT INGESTION (BullMQ / Redis)                  │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │ VALIDATION_COMPLETED Event
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                    ORCHESTRATION PIPELINE SUBSYSTEMS                        │
 │                                                                             │
 │  ┌───────────────────────────────────────────────────────────────────────┐  │
 │  │ 1. Intervention Catalog & Selector Engine                             │  │
 │  │    - Selects candidate: SEND_WHATSAPP / SEND_SMS / SEND_EMAIL / LINK  │  │
 │  └───────────────────────────────────┬───────────────────────────────────┘  │
 │                                      │
 │                                      ▼
 │  ┌───────────────────────────────────────────────────────────────────────┐  │
 │  │ 2. Policy & Compliance Engine                                          │  │
 │  │    - Evaluates TRAI/DND, Attempt Limits (max 3), Cool-offs (1800s)    │  │
 │  └───────────────────────────────────┬───────────────────────────────────┘  │
 │                                      │
 │                                      ▼
 │  ┌───────────────────────────────────────────────────────────────────────┐  │
 │  │ 3. Pre-Execution PostgreSQL Safety Check                              │  │
 │  │    - Validates RecoveryControl !== 'STOPPED' & Obligation !== RESOLVED│  │
 │  └───────────────────────────────────┬───────────────────────────────────┘  │
 │                                      │
 │                                      ▼
 │  ┌───────────────────────────────────────────────────────────────────────┐  │
 │  │ 4. Multi-Channel Execution Providers                                  │  │
 │  │    - Twilio WhatsApp / SMS | Resend Email | Razorpay Payment Links     │  │
 │  └───────────────────────────────────┬───────────────────────────────────┘  │
 │                                      │
 │                                      ▼
 │  ┌───────────────────────────────────────────────────────────────────────┐  │
 │  │ 5. Outcome Monitor & Measured Revenue Tracker                         │  │
 │  │    - Checks RevenueObligation truth; updates RecoveryOutcome          │  │
 │  └───────────────────────────────────┬───────────────────────────────────┘  │
 └──────────────────────────────────────┼──────────────────────────────────────┘
                                        │
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                     AUDIT LOG & REASSESSMENT OUTBOX                         │
 │  ┌───────────────────────────────────┐ ┌─────────────────────────────────┐  │
 │  │ Immutable RecoveryAudit Log       │ │ Reassessment Loop Outbox        │  │
 │  │ (Actor: SYSTEM, MERCHANT, etc.)   │ │ (Emits REASSESSMENT_REQUESTED)  │  │
 │  └───────────────────────────────────┘ └─────────────────────────────────┘  │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Technology Stack

- **Runtime**: Node.js v20+, TypeScript (Strict ES2022)
- **Database & Persistence**: Cloud Neon PostgreSQL (`pg` driver + Prisma ORM)
- **Queueing & Bus**: BullMQ v5, Redis (Upstash)
- **Integrations & Providers**:
  - Twilio API (`twilio` SDK) for WhatsApp and SMS delivery
  - Resend API (`resend` SDK) for transactional emails
  - Razorpay API (`razorpay` SDK) for payment link creation
- **Configuration**: Dotenv & Zod environment schema validation

---

## 🚀 Step-by-Step Setup & Running Independently

### Prerequisites

- **Node.js**: v20.x or higher
- **PostgreSQL**: Neon cloud instance or local database
- **Redis**: Upstash cloud instance or local Redis

### Environment Configuration (`.env`)

Create a `.env` file in the module root:

```env
NODE_ENV=development
EXECUTION_MODE=live
DATABASE_URL="postgresql://user:password@ep-sample-neon.tech/neondb?sslmode=require"
REDIS_URL="redis://127.0.0.1:6379"

# Channel Delivery Provider Credentials
TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_AUTH_TOKEN="your_twilio_auth_token"
TWILIO_SMS_FROM="+1234567890"
TWILIO_WHATSAPP_FROM="whatsapp:+14155238886"

RESEND_API_KEY="re_xxxxxxxxxxxxxxxx"
RESEND_FROM_EMAIL="recoveries@yourdomain.com"

RAZORPAY_KEY_ID="rzp_test_TWEQTS4vaQiKvB"
RAZORPAY_KEY_SECRET="JwG1G4hB3xIpuPuwa1bJG9mL"
```

### Installation & Execution

```bash
# Navigate to directory
cd SelectInterventionPipelineOrchestration

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start Worker Process
npm start
```

### Running E2E Test Suite

To run the complete closed-loop test suite covering measured revenue, merchant kill-switches, safety checks, and reassessment loops:

```bash
# Run Closed-Loop E2E Suite
npx tsx tests/closed_loop_e2e_test.ts

# Run Live Customer Test Suite
npx tsx tests/seed_live_customer_test.ts
```
