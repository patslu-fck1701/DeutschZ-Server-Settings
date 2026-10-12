# DeutschZ – Profile-Konfigurationsstand vom 12.10.2026

**Quelle:** Vom Betreiber bereitgestelltes `profiles.zip` (SHA-256: `1d88116ebd89b6c0fe491c9a59dd4224122649f9e8744d9a5ca7cc36092d0660`).

Dies ist **kein vollständiger Wiederherstellungsstand des Serverprofils**. Der Import enthält **26 ausgewählte Konfigurationsdateien**, deren Dateipfade den ursprünglichen relativen Pfaden unter `profiles/` entsprechen. JSON-Dateien wurden beim Übertragen formatiert; die Struktur und Werte wurden anhand der hochgeladenen Quelle übernommen. Die Dateien sind **noch nicht als laufender Gameplay-Stand abgenommen**.

## Enthaltene Konfigurationen
- `DeutschZ-System/`: WorldMemoriez, WitnessZ, Adaptive Camouflage, CarRaidZ, EventSchedulerZ, RAVEN/AirdropZ, PointsZ, RadioMissionZ, BattlegroundZ, ToxicZ, AFKZ, RoamingBlackMarket, Operation DeutschZ, KotHZWaves, PvP UI
- `ExpansionMod/Settings/`: AISettings, VehicleSettings, QuestSettings, NotificationSettings, RaidSettings
- `AIConvoy/`: AIConvoySettings
- `CodeLock/`: CodeLockConfig und RaG_BaseItems_CodeLockConfig
- `RFFSHeli/`: MasterConfig, Apache und R22

## Weiter aktualisierte Dateien im Branch
- Repository-Wurzel `serverDZ.cfg` – Stand vom 12.10., **Server-/Admin-Passwörter durch `<SET_ON_HOST>` ersetzt**.
- Repository-Wurzel `automodupdate-modlist.txt` – aktuelle Workshop-Abonnementliste.
- `modlist.txt` ist mit der hochgeladenen Liste bereits identisch und wurde nicht neu geschrieben.
- `automodupdate-steamlogindata.txt` bleibt die vorhandene, sichere Platzhaltervorlage; **die tatsächlich hochgeladenen Steam-Zugangsdaten wurden nicht veröffentlicht**.

## Ausgeschlossen: Geheimnisse, personenbezogene Daten und Runtime
**Nicht eingecheckt:** `secrets.json`, `automodupdate-steamlogindata.txt` mit echten Werten, `Permissions/credentials.txt`, RCon-/Steam-/API-/Discord-Webhook-Passwörter, Adminlisten und IDs, `Users/`, `_QuickMoveItemsByCategory/PlayerConfigs/`, `history/`, `Persistence/`, `Runtime/`, `*.heard`, `*.done`, `ledger.json`, `*.bin`, `*.vpp`, Logs und RPTs sowie altbenannte `.bak`- und `before-*`-Stände. Nicht alle anderen 1011 Dateien wurden übertragen: insbesondere umfangreiche Händler-/Loot-/NPC-/Routen- und Questdaten brauchen eine gesonderte, kontrollierte Prüfung, bevor sie öffentlich versioniert werden dürfen.

## Auffälligkeit zum Prüfen
`automodupdate-modlist.txt` enthält unter anderem `@FoXyKOTH` und `@MWGSM_Trader`, die in der bereitgestellten `modlist.txt` nicht stehen. Das kann durch die serverseitige Konfiguration/andere Startparameter gewollt sein, sollte aber beim Deployment-Abgleich geprüft werden. **Hier nicht eigenmächtig ergänzt oder gelöscht.**

## Wiederherstellung
Das vollständige Original `profiles.zip` privat behalten. Im Repo stehen ausgewählte **Einstellungen**, nicht die persistenten Zustände, Spielerpositionen, Questfortschritte oder Zugangsdaten. Die Profil-Konfigurationen dürfen nicht einfach gegen Live-Daten überschrieben werden: vorher Backup, Mod-/Versionsabgleich und Testserverprüfung durchführen.

**Branch:** `snapshot/profiles-2026-10-12`, auf dem vorherigen Missions-Snapshot aufgebaut. **Keine Änderung an `main`, kein Serverdeployment/Restart.**
