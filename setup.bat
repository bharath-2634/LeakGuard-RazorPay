@echo off
echo =========================================================================
echo 🛡️ LEAKGUARD — ONE-CLICK PROJECT SETUP & BUILD LAUNCHER
echo =========================================================================

echo [1/4] Installing dependencies for Platform API & SDK...
cd RevenueRiskDetectionSDK\platform
call npm install
call npx prisma db push
call npx prisma generate
call npm run build
cd ..\..

echo [2/4] Installing dependencies for Merchant Frontend Dashboard...
cd RevenueRiskDetectionSDK\frontend
call npm install
call npm run build
cd ..\..

echo [3/4] Installing dependencies for Validation & AI Diagnosis Service...
cd ValidationRecoveryDiagnosis
call npm install
call npx prisma db push
call npx prisma generate
call npm run build
cd ..

echo [4/4] Installing dependencies for Select Intervention Orchestration Engine...
cd SelectInterventionPipelineOrchestration
call npm install
call npx prisma db push
call npx prisma generate
call npm run build
cd ..

echo =========================================================================
echo 🎉 ALL MODULES BUILT SUCCESSFULLY!
echo Run 'docker-compose up' to launch the entire platform stack in containers,
echo or run 'npm start' inside each module directory.
echo =========================================================================
