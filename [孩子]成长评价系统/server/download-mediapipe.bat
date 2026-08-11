@echo off
chcp 65001 >nul
REM 下载 MediaPipe Hands 0.4 资源到 server/public/mediapipe/（手势控制离线可用，无需联网）
setlocal enabledelayedexpansion
set "DIR=%~dp0public\mediapipe"
set "BASE=https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4"
if not exist "%DIR%" mkdir "%DIR%"
set FILES=hands.js hands_solution_packed_assets.data hands_solution_packed_assets_loader.js hands_solution_simd_wasm_bin.js hands_solution_simd_wasm_bin.wasm hands.binarypb
for %%f in (%FILES%) do (
  echo 下载 %%f ...
  curl -s -L -o "%DIR%\%%f" "%BASE%/%%f"
  if errorlevel 1 (echo [失败] %%f & exit /b 1) else (echo [OK] %%f)
)
echo 完成。手势模型已就绪：%DIR%
endlocal
pause
