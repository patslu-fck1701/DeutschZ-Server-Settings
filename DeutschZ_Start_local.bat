@echo off
title DeutschZ DayZ Server
color 0A

cd /D "%~dp0"

set "SERVER_EXE=DayZServer_x64.exe"
set "CONFIG=serverDZ.cfg"
set "PORT=2302"
set "PROFILES=profiles"
set "MODS=@CF;@Dabs Framework;@Community-Online-Tools;@VPPAdminTools;@DayZ-Expansion-Bundle;@DayZ-Expansion-Licensed;@BaseBuildingPlus;@Code Lock;@RaG_Core;@RaG_BaseItems;@RedFalcon Flight System Heliz;@NoxZ_Phone;@NVG + Scope;@RevScopes;@MegaFoodPack;@Modular Vest System-Bastions Editon;@ReDos Bags;@ArmA2 Trucks;@SNAFU Weapons;@COT Bundle Utility;@RUSForma_vehicles;@DeutschZ_only_core"
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
