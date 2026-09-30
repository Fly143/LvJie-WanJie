@echo off
rem ASCII-only on purpose: cmd.exe mangles non-ASCII bytes inside .cmd files.
rem Windows launcher for the desktop build living in runtime\.
setlocal
set "EXE=%~dp0runtime\AgentWorlds.exe"
if not exist "%EXE%" (
  echo [x] runtime\AgentWorlds.exe not found. Run "npm run rebuild:runtime" first.
  pause
  exit /b 1
)
rem Normal launch first; if it exits within a few seconds (Chromium sandbox is not
rem usable in some restricted/remote sessions and the app quits silently), retry
rem once with --no-sandbox.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$exe='%EXE%'; $p = Start-Process -FilePath $exe -PassThru; Start-Sleep -Seconds 5; if ($p.HasExited) { Write-Host '[i] normal launch failed, retrying with --no-sandbox ...'; Start-Process -FilePath $exe -ArgumentList '--no-sandbox' | Out-Null } else { Write-Host '[i] started.' }"
endlocal
