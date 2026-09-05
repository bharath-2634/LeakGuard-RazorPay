#!/usr/bin/env bash
set -e

echo "========================================================================="
echo "🛡️ LEAKGUARD — ONE-CLICK PROJECT SETUP & BUILD LAUNCHER"
echo "========================================================================="

echo "📌 [1/4] Installing dependencies for Platform API & SDK..."
cd RevenueRiskDetectionSDK/platform
npm install
npx prisma db push
npx prisma generate
npm run build
cd ../..

echo "📌 [2/4] Installing dependencies for Merchant Frontend Dashboard..."
cd RevenueRiskDetectionSDK/frontend
npm install
npm run build
cd ../..

echo "📌 [3/4] Installing dependencies for Validation & AI Diagnosis Service..."
cd ValidationRecoveryDiagnosis
npm install
npx prisma db push
npx prisma generate
npm run build
cd ..

echo "📌 [4/4] Installing dependencies for Select Intervention Orchestration Engine..."
cd SelectInterventionPipelineOrchestration
npm install
npx prisma db push
npx prisma generate
npm run build
cd ..

echo "========================================================================="
echo "🎉 ALL MODULES BUILT SUCCESSFULLY!"
echo "Run 'docker-compose up --build' to spin up all containers."
echo "========================================================================="
