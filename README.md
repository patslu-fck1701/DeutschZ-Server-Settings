# DeutschZ Server Settings

Zentrale Versionsverwaltung für die **selbst erstellten und bewusst gepflegten Einstellungen** des DeutschZ DayZ-Servers.

Dieses Repository ist **kein Backup einer DayZ-Serverinstallation**. Es enthält weder Vanilla-Dateien noch Steam-Workshop-Mods, PBOs, Serverprogramme oder Laufzeitdaten. Gespeichert werden nur eigene, bereinigte Einstellungen, Vorlagen und Dokumentationen, die für den Aufbau des lokalen Testservers und des LiveServers benötigt werden.

## Zweck

- Änderungen an Servereinstellungen nachvollziehbar dokumentieren
- lokale Test- und Live-Konfiguration kontrolliert vergleichen
- geheime Werte konsequent aus Git heraushalten
- Mod-Ladereihenfolge, Abhängigkeiten und Versionsstände dokumentieren
- geprüfte Stände über Tags und Releases markieren
- Deployment und Rollback reproduzierbar machen

## Repository-Grenze

Erlaubt sind insbesondere:

- selbst erstellte oder angepasste Settings
- bereinigte Beispielkonfigurationen mit Platzhaltern
- JSON-, XML-, CFG-, INI- und TXT-Konfigurationen, sofern sie keine Geheimnisse enthalten
- Dokumentation zu Mods, Startparametern, Restart-Zeiten und Serveraufbau
- Testmatrizen, Checklisten und Änderungsprotokolle
- kleine Hilfsskripte zur Validierung oder Bereitstellung

Nicht erlaubt sind:

- DayZ- oder DayZServer-Programmdateien
- vollständige Vanilla-Missionen oder unveränderte Spieldateien
- Steam-, SteamCMD- oder Workshop-Verzeichnisse
- fremde Mods, PBOs, Signaturen oder Mod-Assets
- Profile, Persistence, Storage, Logs und Crash-Dumps
- Passwörter, Tokens, Webhooks, Zugangsdaten und private Schlüssel
- große Binärdateien oder komplette Server-Backups

Details stehen in [`docs/REPOSITORY_SCOPE.md`](docs/REPOSITORY_SCOPE.md).

## Struktur

```text
DeutschZ-Server-Settings/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── workflows/
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── docs/
│   ├── CHANGE_WORKFLOW.md
│   ├── DEPLOYMENT_CHECKLIST.md
│   ├── MOD_LOAD_ORDER.md
│   ├── REPOSITORY_SCOPE.md
│   ├── SERVER_INVENTORY.md
│   └── TEST_MATRIX.md
├── settings/
│   ├── shared/
│   ├── local/
│   └── live/
├── templates/
├── .editorconfig
├── .gitattributes
├── .gitignore
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── SECURITY.md
└── README.md
```

## Settings-Aufteilung

### `settings/shared`

Gemeinsame, bereinigte Einstellungen, die für Test- und LiveServer identisch sein sollen.

### `settings/local`

Nur lokale Abweichungen für Entwicklung und Tests. Keine Passwörter oder persönlichen Pfade einchecken.

### `settings/live`

Bereinigte Live-Konfigurationen. Geheime Werte müssen als Platzhalter oder externe Variablen eingebunden werden.

## Sicherheitsregel

Echte Zugangsdaten gehören niemals in dieses Repository.

```text
SERVER_PASSWORD=<SET_ON_HOST>
ADMIN_PASSWORD=<SET_ON_HOST>
STEAM_USERNAME=<SET_ON_HOST>
STEAM_PASSWORD=<SET_ON_HOST>
DISCORD_WEBHOOK=<SET_ON_HOST>
```

Für lokale Werte darf eine ignorierte Datei verwendet werden, zum Beispiel:

```text
.env.local
settings/local/secrets.local.env
```

Eine sichere Vorlage liegt unter [`templates/secrets.env.example`](templates/secrets.env.example).

## Arbeitsablauf

1. Ausgangsstand sichern.
2. Änderung in einem eigenen Branch durchführen.
3. Geheimnisse und fremde Dateien entfernen.
4. JSON/XML/CFG-Dateien prüfen.
5. Änderung lokal testen.
6. `CHANGELOG.md` aktualisieren.
7. Pull Request oder kontrollierten Merge durchführen.
8. Live-Deployment mit Checkliste ausführen.
9. Funktion und Logs prüfen.
10. Stabilen Stand taggen.

Empfohlene Branches:

```text
main                  geprüfter Live-Stand
development           zusammengeführter Teststand
feature/<name>         neue Einstellung oder Funktion
fix/<name>             gezielte Fehlerkorrektur
hotfix/<name>          dringende Live-Korrektur
```

## Commit-Beispiele

```text
chore: initialize settings repository
config: document current mod load order
config: add sanitized Expansion notification settings
fix: correct invalid SpawnSettings JSON
fix: align restart schedule to 01 07 13 19
release: prepare settings v1.0.0
```

## Versionen

Stabile Stände werden über Git-Tags markiert:

```text
v0.1.0-repository-base
v0.2.0-local-baseline
v0.5.0-events-configured
v1.0.0-live-baseline
```

## Aktuelle Priorität

1. KotHZ
2. ConvoyZ
3. Screen Menu und Loading Screen
4. KillReward
5. EventItems
6. Live-Test
7. Bugfixes
8. Release

## Lizenz

Dieses Repository ist proprietär. Nutzung, Weitergabe und Veröffentlichung sind nur mit ausdrücklicher Erlaubnis des Rechteinhabers gestattet. Siehe [`LICENSE`](LICENSE).

DayZ und zugehörige Marken gehören ihren jeweiligen Rechteinhabern. Dieses Projekt ist nicht offiziell mit Bohemia Interactive verbunden.
