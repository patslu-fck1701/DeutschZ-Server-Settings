# Repository Scope

## Ziel

Dieses Repository speichert ausschließlich eigene DeutschZ-Servereinstellungen und deren Dokumentation.

## Gehört hinein

- manuell gepflegte und bereinigte Konfigurationen
- Einstellungen, die vom Vanilla- oder Mod-Standard abweichen
- Beispielwerte mit Platzhaltern
- Dokumentation von Modnamen, Workshop-IDs und Lade-Reihenfolge
- Restart-, Deployment- und Testdokumentation
- Validierungs- und Wartungsskripte

## Gehört nicht hinein

- DayZ-/DayZServer-Installationsdateien
- komplette `mpmissions`- oder Vanilla-Verzeichnisse
- SteamCMD und Workshop-Downloads
- fremde Modinhalte
- PBO, P3D, PAA, OGG, Signaturen und Keys
- Profile, Storage, Persistence und Datenbanken
- Logs, Crash-Dumps und Admin-Logs
- Backups und Archive
- Zugangsdaten

## Grundsatz für Settings

Nur Dateien versionieren, die bewusst geändert oder selbst erstellt wurden. Unveränderte Standarddateien werden nicht kopiert. Stattdessen dokumentiert eine README, aus welcher Software- oder Modversion die Einstellung stammt und welche Werte geändert wurden.

## Fremde Mods

Für fremde Mods werden nur Metadaten dokumentiert:

```text
Modname
Workshop-ID
Version oder Prüftag
Abhängigkeiten
Ladeposition
benötigte Konfigurationsdateien
bekannte Besonderheiten
```

Fremde Dateien werden nicht gespiegelt.
