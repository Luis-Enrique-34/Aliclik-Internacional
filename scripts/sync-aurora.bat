@echo off
REM Sincroniza los pedidos internacionales de AURORA con la plataforma.
REM Uso: scripts\sync-aurora.bat                       (ultimos AURORA_DIAS dias)
REM      scripts\sync-aurora.bat --desde 2026-01-01    (refresca todo desde esa fecha)
cd /d "%~dp0.."
if not exist logs mkdir logs
call npm run -s sync:aurora -- %* >> logs\sync-aurora.log 2>&1
