@echo off
title DeutschZ DayZ Server
color 0A

cd /D "%~dp0"

set "SERVER_EXE=DayZServer_x64.exe"
set "CONFIG=serverDZ.cfg"
set "PORT=2302"
set "PROFILES=profiles"
set "MODS=@CF;@Dabs Framework;@Community-Online-Tools;@VPPAdminTools;@DayZ-Expansion-Bundle;@DayZ-Expansion-Licensed"
set "SERVERMODS=@Editor Lights"

echo ==========================================
echo Starte DeutschZ DayZ Server
echo Port: %PORT%
echo Mission: wird ueber serverDZ.cfg geladen
echo Profile: %PROFILES%
echo ==========================================

"%SERVER_EXE%" ^
-config=%CONFIG% ^
-port=%PORT% ^
-profiles=%PROFILES% ^
-mod "%MODS%" ^
-serverMod "%SERVERMODS%" ^
-dologs ^
-adminlog ^
-netlog ^
-freezecheck ^
-noFilePatching

echo.
echo Server wurde beendet.
pause
