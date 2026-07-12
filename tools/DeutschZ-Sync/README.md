# DeutschZ Server Control

Ein gemeinsames Windows-Werkzeug fuer Workshop-Updates, Server-Settings,
Modreihenfolge und DayZ-Logs.

## Oberflaeche

### Pfade & Ziele

Alle Pfade werden direkt im Programm gepflegt:

- Settings-Repo, Profiles, Mission und Keys
- Steam-Workshop
- lokaler DayZServer
- Live-Freigabe
- FTP/FTPS
- lokale und Live-Logordner
- Logo

Die Layout-Erkennung kennt `profiles`, `profile`, `config`, `configs`,
`mpmissions`, `missions` und typische verschachtelte Server-Roots. Das
Nitrado-Profil bevorzugt `configs`. Jeder erkannte Pfad bleibt manuell
ueberschreibbar.

### Workshop-Auto-Deploy

Der Workshop-Ordner wird automatisch ueberwacht. Der erste Lauf erstellt nur
eine Baseline. Nach einer stabilen Aenderung wird der komplette betroffene
`@Mod`-Ordner auf alle aktiven Ziele kopiert beziehungsweise hochgeladen.
Gefundene `.bikey`-Dateien werden zusaetzlich in den Server-`keys`-Ordner
uebertragen.

### Mod und Settings per Drag-and-Drop

Im Reiter `Settings bearbeiten` liegen zwei Felder nebeneinander:

- `MOD HINZUFUEGEN`: erkennt `@Mod`-Ordner, Quellpfad und Modnamen, fuegt den
  Mod an die Reihenfolge an und nimmt ihn in die Workshop-Ueberwachung auf.
- `SETTING HINZUFUEGEN`: importiert JSON, XML, CFG, INI, MAP, C, TXT, CSV,
  YAML oder BAT nach Profiles, Mission, Server-Root oder in den aktuell
  ausgewaehlten Ordner.

Die Modreihenfolge kann hoch- und heruntergeschoben werden. Als feste
Basisreihenfolge gilt:

```text
@CF
@Dabs Framework
@Community-Online-Tools
@DayZ-Expansion-Licensed
@DayZ-Expansion-Bundle
@VPPAdminTools
```

Soweit `meta.cpp` vorhanden ist, werden `publishedid` und `dependencies[]`
zusaetzlich ausgewertet.

### Settings-Editor

Der Editor zeigt alle freigegebenen Dateien aus Profiles, Mission und
Server-Root. JSON/XML werden vor dem Speichern validiert. Gespeichert wird als
UTF-8 ohne BOM. Vor dem Ueberschreiben liegt ein Backup unter:

```text
%LOCALAPPDATA%\DeutschZ\SettingsSync\backups
```

### Log-Zentrale

Die neuesten RPT-, ADM-, Script-, Crash-, Warning- und Mod-Logs werden in einer
Ansicht zusammengefuehrt. Die Ausgabe kann gefiltert, kopiert oder als einzelne
Diagnose-Datei gespeichert werden.

Bekannte Logs unter `logs`, `profiles`, `config`, `configs`, ExpansionMod,
VPPAdminTools, Community Online Tools/COT und EventManager werden rekursiv
erfasst. Standardmaessig werden passende Logs und Crash-Dumps nach fuenf Tagen
automatisch geloescht.

### Serversteuerung

Der lokale Server kann ueber eine frei waehlbare BAT-, CMD- oder EXE-Datei
gestartet werden. Stop und Restart verwenden den konfigurierten Prozessnamen
und erfordern in der Oberflaeche eine Bestaetigung.

Remote-Server koennen ueber Nitrado Service-ID/API-Token oder ueber frei
konfigurierbare Start-, Stop- und Restart-Webhooks gesteuert werden. FTP allein
ist nur fuer Dateien zustaendig und kann keinen Serverprozess steuern.

Datei-Sync und Workshop-Deploy loesen niemals automatisch einen Stop oder
Restart aus.

## Sicherheit

- JSON/XML mit UTF-8-BOM oder Syntaxfehlern werden blockiert.
- Settings-Loeschungen werden nicht automatisch auf Ziele gespiegelt.
- Der erste Settings- und Workshop-Lauf ist nur eine Baseline.
- Backups und Runtime-Daten liegen ausserhalb des Repos.
- `config.local.json` mit lokalen Pfaden und FTP-Daten wird von Git ignoriert.
- Das Tool startet oder stoppt keinen DayZ-Server.

## Start

`Start DeutschZ Sync.cmd` installiert bei Bedarf die Drag-and-Drop-Komponente
und startet die Oberflaeche. Workshop- und Settings-Automatik starten gemaess
den sichtbaren Schaltern im Pfad-Panel.

Kommandozeile:

```powershell
python deutschz_sync.py --once
python deutschz_sync.py --headless
python deutschz_sync.py --full-sync
```
