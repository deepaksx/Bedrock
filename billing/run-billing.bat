@echo off
echo ================================
echo  AWS Billing Dashboard
echo ================================
echo.
echo Requires IAM credentials (not Bedrock API key).
echo Run "aws configure" first if not set up.
echo.

REM set AWS_ACCESS_KEY_ID=your-access-key
REM set AWS_SECRET_ACCESS_KEY=your-secret-key
set AWS_REGION=us-east-1

cd /d "%~dp0"
echo Starting dashboard at http://localhost:3000 ...
echo.
start http://localhost:3000
node server.js
pause
