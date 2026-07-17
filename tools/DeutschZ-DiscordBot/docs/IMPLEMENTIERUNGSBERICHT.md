# DeutschZ Discord Bot – Implementierungsbericht

Stand: 18.07.2026

## Bestehendes System

Der vorhandene TypeScript-/discord.js-Bot, seine Datenbank, Commands, Panels, Rollen, Tickets, Moderation, Events, Benachrichtigungen und FTP-Freigabelogik bleiben die gemeinsame Laufzeit. Es wurde kein zweiter Bot erstellt.

## Sicherheits- und Command-Audit

- 59 Ausgangscommands vollständig geprüft.
- `/health` und `/mods-list` als Doppelungen entfernt; 57 eindeutige Commands registriert.
- Kritische Commands prüfen Berechtigungen erneut zur Laufzeit, antworten grundsätzlich ephemer und schreiben Secret-freie Auditdaten.
- Owner-only basiert ausschließlich auf `680138829965164553`.
- Hauptfreigeber und Ronny werden ausschließlich über Discord-User-ID erkannt.
- Rollenbasierte zusätzliche FTP-Rechte verwenden nur konfigurierbare Rollen-IDs.
- FTP bleibt durch zwei unabhängige, standardmäßig falsche Flags deaktiviert.

## WebsitePublisher → WhatsApp

- Signierter `POST /webhooks/websitepublisher/leads`
- HMAC-SHA256 über Timestamp und exakten Raw Body
- maximales Zeitfenster, Idempotency-Key, Replay- und Duplikatschutz
- ausschließlich freigegebene Formulare und strikt validiertes JSON
- Payloadlimit und pro-IP Rate-Limit
- dauerhafte Lead-Tabelle ohne künstliche Anzahlbegrenzung
- persistente Queue mit maximal fünf Versuchen und exponentiellem Backoff
- UNKNOWN-Zustand nach Neustart während eines unklaren Versands statt riskanter Doppelzustellung
- offizieller Meta-Graph-API-Client ohne Browserautomation oder inoffizielle WhatsApp-Library
- Meta Verify-Challenge und `X-Hub-Signature-256`
- eingehende, deduplizierte WhatsApp-Nachrichten
- ausschließlich Owner-Nummer darf Statusbefehle ausführen
- `OFFEN` mit zehn Datensätzen pro Seite sowie `SUCHE`
- Status-, Zustellungs- und Fehleraudit ohne Tokens, Telefonnummer oder Leadinhalt im Log
- Discord- und E-Mail-Spiegelung deaktiviert

## Validierung

- ESLint: PASS
- TypeScript: PASS
- 6 Testdateien / 31 Tests: PASS
- HMAC gültig/ungültig/abgelaufen: PASS
- Replay/Duplikat/Schema: PASS
- deaktivierter Versand: PASS
- gemockter Cloud-API-Erfolg und Fehler: PASS
- Retry/Terminalfehler/Neustart: PASS
- fremde Nummer abgewiesen: PASS
- Owner-Statusbefehle und Pagination: PASS
- Meta-Signatur: PASS
- keine echte WhatsApp-Nachricht gesendet

## Aktivierungsblocker

Livebetrieb bleibt deaktiviert, bis die in `docs/WEBSITE_WHATSAPP.md` aufgeführten Meta-/Webhook-Werte ausschließlich lokal gesetzt, der HTTPS-Endpunkt erreichbar und die Testsequenz vollständig bestanden ist.
