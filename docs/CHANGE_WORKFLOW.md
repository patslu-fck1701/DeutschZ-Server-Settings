# Änderungsablauf

## 1. Ausgangslage erfassen

- betroffene Einstellung benennen
- aktuelle Version und Quelle notieren
- Backup außerhalb des Repositories anlegen
- relevante Logs sichern, aber nicht committen

## 2. Branch erstellen

```bash
git switch main
git pull
git switch -c fix/beschreibung
```

## 3. Änderung durchführen

- nur notwendige Dateien ändern
- echte Passwörter durch Platzhalter ersetzen
- lokale Pfade entfernen
- Dateiformat und Encoding erhalten

## 4. Prüfen

```bash
git status --short
git diff --check
git diff
```

Zusätzlich JSON und XML validieren und die Testmatrix ausfüllen.

## 5. Commit

```bash
git add <dateien>
git diff --staged
git commit -m "fix: kurze klare beschreibung"
```

## 6. Test und Freigabe

- lokalen Server starten
- relevante Funktionen prüfen
- Fehlerlogs kontrollieren
- Changelog aktualisieren
- Pull Request erstellen

## 7. Live-Deployment

Deployment-Checkliste verwenden und Rollback-Dateien außerhalb des Repositories bereithalten.
