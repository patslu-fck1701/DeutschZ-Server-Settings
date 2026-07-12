# DeutschZ Settings Sync

Synchronisiert freigegebene Server-Settings aus
`E:\DeutschZ\DeutschZ-Server-Settings` inkrementell auf mehrere Ziele.

## Sicherheitsmodell

- Das Repository ist immer die Quelle.
- Der erste Start erstellt nur eine Baseline und kopiert nichts.
- Nur neue oder geaenderte Dateien werden uebertragen.
- JSON und XML werden vor dem Kopieren validiert.
- UTF-8-BOM in JSON/XML wird abgelehnt.
- Loeschungen werden standardmaessig nur gemeldet, nicht weitergegeben.
- Laufzeitdaten, Logs, Storage und Backups sind ausgeschlossen.
- FTP-Zugangsdaten kommen nur aus Umgebungsvariablen.

## Start

`Start DeutschZ Sync.cmd` oeffnet die Oberflaeche. Danach `Monitor starten`
waehlen. `Vollsync` ist eine bewusste manuelle Aktion mit Rueckfrage.

Im Tab `Settings bearbeiten` stehen alle freigegebenen Dateien aus `profiles`,
`mpmissions` und dem Server-Root zur Verfuegung. Die Liste kann durchsucht und
nach Bereich gefiltert werden. `Speichern + Sync` validiert JSON/XML, legt ein
Backup unter `%LOCALAPPDATA%\DeutschZ\SettingsSync\backups` an, schreibt UTF-8
ohne BOM und verteilt die Aenderung anschliessend auf die aktiven Ziele.

Kommandozeile:

```powershell
python deutschz_sync.py --once
python deutschz_sync.py --headless
python deutschz_sync.py --full-sync
```

## Konfiguration

Beim ersten Start wird aus `config.example.json` eine ignorierte
`config.local.json` erzeugt. Lokal und die erreichbare Windows-Freigabe sind
vorkonfiguriert. FTP bleibt aus, bis die Zielpfade und diese Variablen gesetzt
sind:

```powershell
$env:DEUTSCHZ_FTP_HOST = "ftp.example.invalid"
$env:DEUTSCHZ_FTP_USER = "username"
$env:DEUTSCHZ_FTP_PASSWORD = "password"
```

Der Sync startet oder stoppt keinen DayZ-Server. Viele Settings werden erst
nach einem Server-Neustart aktiv.
