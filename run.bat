@echo off
echo ================================
echo  Amazon Bedrock API Test
echo ================================
echo.

REM --- Configure your Bedrock API Key here ---
REM set BEDROCK_API_KEY=your-bedrock-api-key-here
set AWS_REGION=ap-south-1
REM set BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0

echo [1] Basic Test (list models + single prompt)
echo [2] Interactive Streaming Chat
echo [3] Custom Prompt
echo [Q] Quit
echo.
set /p choice="Select option: "

if /i "%choice%"=="1" (
    echo.
    echo Running basic test...
    echo.
    node index.js
)
if /i "%choice%"=="2" (
    echo.
    echo Starting chat...
    echo.
    node chat.js
)
if /i "%choice%"=="3" (
    echo.
    set /p prompt="Enter your prompt: "
    echo.
    node index.js "%prompt%"
)
if /i "%choice%"=="Q" (
    exit /b
)

echo.
pause
