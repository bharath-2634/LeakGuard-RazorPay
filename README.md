# 🛡️ LeakGuard — Autonomous Revenue Risk Detection & Closed-Loop Recovery Engine

> **Built for Razorpay Buildathon 2026**  
> *Track: Find revenue that’s slipping away and win it back*

[![Production Status](https://img.shields.io/badge/Railway-Deploys_Passing-00C7B7?style=flat&logo=railway&logoColor=white)](https://leakguard-razorpay-production.up.railway.app/health)
[![Live Merchant Portal](https://img.shields.io/badge/Live_Portal-Active-4F46E5?style=flat&logo=react&logoColor=white)](https://rare-benevolence-production-74c5.up.railway.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict_ES2022-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon_Cloud-4169E1?style=flat&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Google Gemini AI](https://img.shields.io/badge/Google_Gemini-Root_Cause_AI-8E75B2?style=flat&logo=google&logoColor=white)](https://ai.google.dev/)

---

## 🚀 Live Demo & Production Links

- 🌐 **Live Merchant Observer & Control Portal**: [https://rare-benevolence-production-74c5.up.railway.app/](https://rare-benevolence-production-74c5.up.railway.app/)
- ⚙️ **Platform REST API Server**: `https://leakguard-razorpay-production.up.railway.app`
- 📊 **Live Measured Metrics Endpoint**: [`GET /v1/recovery-metrics?merchantId=m_shopexpress_9f82a`](https://leakguard-razorpay-production.up.railway.app/v1/recovery-metrics?merchantId=m_shopexpress_9f82a)

---

## 💡 Executive Summary & The Razorpay High Bar

Revenue loss rarely happens in one clean step. A payment degrades due to bank outages, a card expires, 3DS authentication times out, or a UPI mandate approval is delayed. 

**LeakGuard** is an autonomous, compliant revenue recovery platform that closes the loop from detecting payment failures to diagnosing root causes with Google Gemini AI, enforcing merchant safety policies, executing multi-channel recovery interventions (WhatsApp, SMS, Email, Payment Links), and measuring actual realized money recovered across batches.

### 🌟 Key Differentiators Meeting Razorpay Standards:

1. **Measured Recovered Revenue (Not Delivery Status)**: LeakGuard marks an outcome as `RECOVERED` **only when payment resolution (`RevenueObligation = RESOLVED`) is authoritatively confirmed in PostgreSQL**.
2. **Merchant Emergency Kill Switch**: Live pre-execution safety check (`runFinalSafetyCheckAsync`) executed milliseconds before any external side effect, respecting merchant stop decisions in real time.
3. **Compliant Escalation & Stopping Rules**: Enforces global retry bounds (max 3 attempts), TRAI/DND compliance, and channel-specific cool-off windows (1800s).
4. **Immutable Audit Trail**: Append-only `RecoveryAudit` logging every system decision, AI diagnosis, policy check, provider side-effect, and merchant intervention.

---

## 🏗️ End-to-End System Architecture

```text
                                  LEAKGUARD ARCHITECTURE
                                  
  ┌──────────────────────┐        ┌──────────────────────┐        ┌──────────────────────┐
  │  Client SDK & Ingest │        │  Validation & AI     │        │  Select Intervention │
  │  (Platform API Node) │        │  Diagnosis Worker    │        │  & Orchestration     │
  └──────────┬───────────┘        └──────────┬───────────┘        └──────────┬───────────┘
             │                               │                               │
             │ Webhook Ingestion             │ Gemini Root Cause             │ Policy, Safety Check,
             │ & Outbox Event                │ & Priority Scoring            │ Multi-Channel Delivery
             ▼                               ▼                               ▼
  ┌──────────────────────────────────────────────────────────────────────────────────────┐
  │                           SHARED PERSISTENCE & QUEUE BUS                             │
  │  ┌────────────────────────────────────────┐ ┌─────────────────────────────────────┐  │
  │  │ Cloud Neon PostgreSQL (Prisma ORM)     │ │ Upstash Redis (BullMQ Queues)       │  │
  │  │ - RevenueObligation (Truth)            │ │ - risk-event-ingestion-queue        │  │
  │  │ - RiskEvent & ValidationResult         │ │ - intervention-selection-queue      │  │
  │  │ - RecoveryControl & RecoveryAudit      │ │ - execution-measure-queue           │  │
  │  └────────────────────────────────────────┘ └─────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Repository Modules & Branches

This repository is organized into modular services:

| Module Directory | Branch Name | Purpose & Responsibilities | README Link |
| :--- | :--- | :--- | :--- |
| **`RevenueRiskDetectionSDK/`** | `RevenueRiskDetection-SDK` | Browser SDK, Platform API, Razorpay Webhook Ingestion, Merchant Dashboard | [View Module README](./RevenueRiskDetectionSDK/README.md) |
| **`ValidationRecoveryDiagnosis/`** | `ValidationRecoveryDiagnosis` | Event Consumers, Actionability Scorer, Google Gemini AI Diagnosis | [View Module README](./ValidationRecoveryDiagnosis/README.md) |
| **`SelectInterventionPipelineOrchestration/`** | `InterventionExecutionEngine` | Intervention Selection, Policy Enforcement, Multi-Channel Execution, Outcome Monitor | [View Module README](./SelectInterventionPipelineOrchestration/README.md) |

---

## ⚡ Quickstart — Running the Entire Project with One Command

You can spin up the entire LeakGuard platform (PostgreSQL, Redis, Platform API, Merchant Dashboard, Validation Worker, and Orchestration Worker) using Docker Compose or setup scripts.

### Option A: Using Docker Compose (Recommended)

```bash
# 1. Clone Repository
git clone https://github.com/bharath-2634/LeakGuard-RazorPay.git
cd LeakGuard-RazorPay

# 2. Set Environment Variables
export GEMINI_API_KEY="your_google_gemini_api_key"
export TWILIO_ACCOUNT_SID="your_twilio_sid"
export TWILIO_AUTH_TOKEN="your_twilio_auth_token"
export RESEND_API_KEY="your_resend_api_key"
export RAZORPAY_KEY_ID="rzp_test_TWEQTS4vaQiKvB"
export RAZORPAY_KEY_SECRET="JwG1G4hB3xIpuPuwa1bJG9mL"

# 3. Launch Platform with Docker Compose
docker-compose up --build
```

Once running:
- **Merchant Dashboard Portal**: `http://localhost:5173`
- **Platform REST API Server**: `http://localhost:3000`
- **PostgreSQL Database**: `localhost:5432`
- **Redis Server**: `localhost:6379`

---

### Option B: Local Script Execution

#### Windows:
```cmd
setup.bat
```

#### Linux / macOS:
```bash
chmod +x setup.sh
./setup.sh
```

---

## 🧪 Running Closed-Loop Test Suites

To execute the automated end-to-end closed-loop test suite validating measured recovery economics, merchant kill switches, and audit logs:

```bash
# Closed-Loop Scenario Suite (A through F)
cd SelectInterventionPipelineOrchestration
npx tsx tests/closed_loop_e2e_test.ts

# Live Customer Scenario Suite
npx tsx tests/seed_live_customer_test.ts
```

---

## 📜 License

Built with ❤️ for **Razorpay Buildathon 2026**. Licensed under the MIT License.
