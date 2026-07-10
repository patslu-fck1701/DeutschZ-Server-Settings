# Sicherheitsrichtlinie

## Keine Geheimnisse in Git

Folgende Inhalte dürfen niemals committed werden:

- Server- und Admin-Passwörter
- Steam-Zugangsdaten oder Guard-Codes
- API-Schlüssel und Tokens
- Discord-Webhooks oder Bot-Tokens
- Datenbank-Zugangsdaten
- private Signaturschlüssel
- SSH-, TLS- oder andere private Schlüssel
- personenbezogene Daten aus Logs oder Profildateien

Verwende Platzhalter oder lokale, ignorierte Dateien.

## Vor jedem Commit

```bash
git status --short
git diff --staged
git grep -nEi "password|passwd|secret|token|webhook|api[_-]?key|steam.*(user|pass)"
```

Treffer müssen geprüft werden. Dokumentierte Platzhalter wie `<SET_ON_HOST>` sind erlaubt.

## Versehentlich veröffentlichte Zugangsdaten

1. Zugangsdaten sofort sperren oder ersetzen.
2. Betroffenen Dienst prüfen.
3. Git-Verlauf bereinigen.
4. Repository-Mitwirkende informieren.
5. Logs auf Missbrauch prüfen.

Nur das Löschen in einem neuen Commit reicht nicht aus, weil der Wert im Verlauf bestehen bleibt.

## Sicherheitsmeldungen

Sicherheitsprobleme nicht als öffentliches Issue veröffentlichen. Nutze eine private Nachricht an den Repository-Inhaber oder die privaten Security-Advisory-Funktionen des Git-Hosters.
