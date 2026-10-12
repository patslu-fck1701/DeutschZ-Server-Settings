# DeutschZ – aktueller Server-Import, 12.10.2026

## Uploads
- `profiles.zip` – 3.342.905 Bytes; 1.183 ZIP-Einträge (1.037 Dateien); SHA-256 `1d88116ebd89b6c0fe491c9a59dd4224122649f9e8744d9a5ca7cc36092d0660`; ZIP-CRC erfolgreich.
- `serverDZ.cfg` – 4.804 Bytes, SHA-256 `26ff27e30b77fcd805a9df7edc1a8d7034d6f4baccb80651e4bcb0e2c526df8f`.
- `modlist(3).txt` – 388 Bytes, SHA-256 `fb1835f368f02e668dc85613a99a70c596fb139e6990fe4ee0f7077abf464ba6`.
- `automodupdate-modlist(3).txt` – 687 Bytes, SHA-256 `3b6c63cdc9308322522fbe0406c0cc3f73cbebd913a5bb4cc28020bb00da82b6`.
- `automodupdate-steamlogindata.txt` – vertrauliches Original, **kein Hash oder Inhalt im Repository erforderlich**.

## Importvorgehen
Versionierte aktuelle Profil-Settings siehe `settings/live/profiles/README.md`. Der unbereinigte Archivinhalt wurde nicht auf GitHub hochgeladen. Der aktuelle Missions-Snapshot befindet sich ebenfalls in der Branch-Historie unter `settings/live/mission/dayzOffline.chernarusplus/`.

## Sicherheit & Grenze
Dieses Repository ist **öffentlich** und enthält laut bestehender Scope-Regel ausschließlich bereinigte, bewusst gepflegte Konfigurationen und Metadaten. Keine Profile als Gesamtarchiv, Spielerdaten, Logdateien, Steam-Zugangsdaten, Adminlisten, Tokens oder Server-Persistence hochladen. Die Originaldateien für eine vollständige Wiederherstellung ausschließlich in einem **privaten Backup** aufbewahren.

## Offene Arbeit
- Restliche bewusst modifizierte, große Konfigurationsdateien (KotHZ-Loot/-Orte, Expansion-Marktkategorien/Trader, RoamingBlackMarket-Route, RadioMissionZ-Definitionen, AIConvoy-Routen) differenziell erfassen und auf Geheimnisse/Personenbezug prüfen.
- CI-Linter für JSON/XML und DayZ spezifische Klassennamen-/Modkonflikte ergänzen.
- Gegen laufende Testserver-Profile validieren und erst nach gezielter Abnahme in `main` übernehmen.
