# Mitwirken

Änderungen müssen klein, nachvollziehbar und testbar bleiben.

## Regeln

- keine Vanilla-, Workshop- oder fremden Mod-Dateien hinzufügen
- keine Geheimnisse oder echten Zugangsdaten committen
- keine kompletten Serverordner oder Backups hochladen
- Settings mit verständlichen Pfaden und Namen ablegen
- Änderungen in `CHANGELOG.md` dokumentieren
- Testauswirkung im Pull Request angeben
- lokale absolute Pfade vermeiden

## Branch-Namen

```text
feature/<thema>
fix/<fehler>
hotfix/<kritischer-fehler>
docs/<dokumentation>
chore/<wartung>
```

## Commit-Stil

```text
config: add sanitized KOTH settings
fix: correct invalid JSON value
docs: update live deployment checklist
chore: tighten repository ignore rules
```

## Pull Request

Ein Pull Request muss beantworten:

- Was wurde geändert?
- Warum war die Änderung nötig?
- Welche Dateien sind betroffen?
- Wie wurde getestet?
- Gibt es Auswirkungen auf LiveServer oder Wipe?
- Wurden Geheimnisse und fremde Dateien ausgeschlossen?
