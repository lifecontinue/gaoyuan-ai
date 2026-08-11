@echo off
chcp 65001 >nul
REM ============================================================
REM  [孩子]成长星空 - AI 服务启动
REM  双击启动：托管前端 + 转发 DeepSeek API
REM  保持此窗口打开；关闭窗口即停止服务
REM ============================================================
cd /d "%~dp0"

set NODE_EXE=C:\Users\haida\.workbuddy\binaries\node\versions\22.22.2\node.exe
if not exist "%NODE_EXE%" (
  echo [INFO] 内置 Node 未找到，尝试系统 Node...
  where node >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] 未找到 Node.js！请安装 Node.js 或检查路径。
    pause
    exit /b 1
  )
  set NODE_EXE=node
)

echo ============================================================
echo   [孩子]成长星空 - AI 服务
echo.
echo   前端地址 : http://localhost:8080/
echo   AI 模型  : DeepSeek (server\.env)
echo.
echo   关闭此窗口即可停止服务
echo ============================================================
echo.

REM 检查端口是否被占用
netstat -ano | findstr ":8080" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo [WARN] 端口 8080 已被占用，正在尝试释放...
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
  )
  echo [INFO] 旧进程已关闭，继续启动...
  echo.
)

if not exist "server\.env" (
  echo [WARN] server\.env 未找到！
  echo       请将 server\.env.example 复制为 .env 并填入 DeepSeek Key。
  echo.
)

echo 正在启动...
echo.

"%NODE_EXE%" server/index.js
echo.
echo ============================================================
echo   服务已停止。按任意键关闭窗口...
echo ============================================================
pause >nul
