# DeutschZ Live-Server Snapshot · 02.10.2026 20:00

## Herkunft

Basis: `Server_Stand_02.10.2026_20_00_Uhr.zip`

- ZIP-Größe: 163.436.561 Bytes
- entpackte Nutzdaten: 552.330.629 Bytes
- Dateien: 2.035
- SHA-256: `cb4f0368b1f3926ba93c5cb785eab8f5ccbeb43f458b47e43c294dc592af13dc`

## Enthaltene Hauptbereiche

- `mpmissions/dayzOffline.chernarusplus`: 863 Dateien
- `profiles`: 1.167 Dateien
- Root-Konfiguration: `serverDZ.cfg`, `modlist.txt`, `servermodlist.txt`, `automodupdate-modlist.txt`, `automodupdate-steamlogindata.txt`

Mission/CE umfasst unter anderem:

- `cfgeconomycore.xml`
- `cfgeventspawns.xml`
- `cfggameplay.json`
- `cfgspawnabletypes.xml`
- `db/events.xml`
- `db/globals.xml`
- `db/messages.xml`
- `db/types.xml`
- modbezogene CE-Dateien unter `dz_mod_ce`

Profile enthalten unter anderem ExpansionMod, DeutschZ-System, VPPAdminTools, CodeLock, RaG_Core, AIConvoy und weitere Live-Settings. Laufzeitlogs und Benutzer-/Spielerdaten werden **nicht** öffentlich versioniert.

## Live Root-Settings

Der öffentliche Repo-Stand enthält die bereinigten aktuellen Varianten von:

- `serverDZ.cfg`
- `modlist.txt`
- `servermodlist.txt`
- `automodupdate-modlist.txt`
- `automodupdate-steamlogindata.txt` als reine Platzhalter-Vorlage

Geheimwerte sind durch `<SET_ON_HOST>` ersetzt.

## Modliste

Aktuell erfasst:

`@CF; @Dabs Framework; @DayZ-Expansion-Licensed; @DayZ-Expansion-Bundle; @VPPAdminTools; @BaseBuildingPlus; @Code Lock; @Breachingcharge; @RaG_Core; @RaG_BaseItems; @RedFalcon Flight System Heliz; @NVG + Scope; @RevScopes; @Forward Operator Gear; @ArmA2 Trucks; @Mortys Weapons; @Moving AI Convoy; @RUSForma_vehicles; @Pizza Time Lite; @Anzio 20mm AMR Rifle; @NomNom Collectibles; @deutschz_serverpack; @Schwanz`

## Signierung

- Öffentlich/verteilbar: `keys/DeutschZ_CoreZ.bikey`
  - SHA-256: `97789c091ca47a8fccbc38253386748423e9af31b35cd39e19f6bb5156e2b11e`
- Privat: `DeutschZ_CoreZ.biprivatekey`
  - nicht im Repository
  - nur im privaten Drive-Ordner „Signing Keys“

## Private Backups

Server-/Source-Snapshot:
https://drive.google.com/drive/folders/1tRdKCTIK7XHR2Vqjg9AiJfDv2xTtiYun

Signing-Keys:
https://drive.google.com/drive/folders/1phKo7XodwV7hjS0uVSTHgs1X2H1TrRDK

Die großen Original-ZIPs wurden wegen der Connector-Größenbegrenzung verlustfrei in Teile zerlegt und zusammen mit `SHA256SUMS.txt` gesichert.
