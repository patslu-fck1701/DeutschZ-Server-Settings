# DeutschZ-System Profile

Dieser Ordner ist die kanonische Profilstruktur fuer die eigenen DeutschZ-Mods.

- Konfigurationen liegen je Mod unter `Config`.
- Persistente Laufzeitdaten liegen unter `Persistence`.
- Statische Datendateien liegen unter `Data`.
- Temporaere Zustandsdaten liegen unter `Runtime`.
- Logs werden zur Laufzeit unter `LogZ` erzeugt und nicht versioniert.

Leere Laufzeitordner werden von den Mods beim Serverstart automatisch angelegt.
Bestehende Altdaten werden nur dann kopiert, wenn am neuen Ziel noch keine Datei vorhanden ist.
