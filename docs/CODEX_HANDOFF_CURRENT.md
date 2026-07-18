# CODEX HANDOFF CURRENT

Aktualisiert: 18.07.2026

## Aktiver Stand

Der DeutschZ Discord wurde mit ausdrücklicher Freigabe vollständig bereinigt und neu aufgebaut. Der Bot enthält außerdem den sicheren WebsitePublisher-Lead-Webhook und die ausschließlich offizielle WhatsApp Business Cloud API-Anbindung. Live-WhatsApp ist weiterhin deaktiviert, weil die echten Meta-/Webhook-Werte lokal noch fehlen.

## Source

- Worktree: `E:\DeutschZ\DeutschZ-Worktrees\DiscordBot`
- Projekt: `E:\DeutschZ\DeutschZ-Worktrees\DiscordBot\tools\DeutschZ-DiscordBot`
- Branch: `codex/discord-clean-rebuild-20260718`

## Letzter Ausgabeordner

- Ziel: `E:\DeutschZ\DeutschZServer\DeutschZ-DiscordBot`
- Synchronisierung: 18.07.2026 02:57:33 +02:00
- Env-Dateien, Datenbank, Logs, Backups und `node_modules` werden ausdrücklich nicht übertragen.

## Technischer Status

- ESLint: PASS
- Vitest: 6 Dateien / 31 Tests PASS
- TypeScript-Build: PASS
- Discord Live-Neuaufbau: PASS
- Discord Live-Bestand: 11 Kategorien, 63 Kanäle, 32 eigene Rollen
- Discord-Duplikate: 0 Kategorien, 0 Kanäle, 0 Rollen
- Feste Live-Rollen: Inhaber / Projektleitung / Projektleitung / Ehrenmitglied + Supporter
- Slash Commands: 57 eindeutige Guild-Commands registriert
- Historische Command-Doppelungen entfernt: `/health`, `/mods-list`
- Feste Personen: ausschließlich per Discord-User-ID autorisiert
- FTP: doppelte Aktivierungssperre; `UPLOAD_ENABLED=false` und `FTP_UPLOAD_ENABLED=false`
- Website-HMAC, Timestamp, Replay, Idempotency, Schema, Rate- und Größenlimit: PASS
- Dauerhafte Lead-Datenbank ohne künstliche Anzahlgrenze: PASS
- Persistente Queue, Backoff, maximales Retry und UNKNOWN-Schutz bei unklarem Versand: PASS
- WhatsApp Cloud API-Client: ausschließlich offizieller Graph-Endpunkt, Mocktests PASS
- WhatsApp-Owner-Befehle: ANNEHMEN, ABLEHNEN, START, ERLEDIGT, STATUS, OFFEN, OFFEN <SEITE>, SUCHE
- Discord-/E-Mail-Spiegelung für Website-Leads: AUS
- Echter WhatsApp-Versand: NICHT AUSGEFÜHRT
- Website-WhatsApp-Kontakt: im gemeinsamen Footer aktiv
- Website-Musikwechsel: BLOCKIERT bis zu einer angemeldeten WebsitePublisher-Dashboard-Sitzung; die API kann die elf lokalen MP3-Dateien mit insgesamt rund 57 MB nicht direkt vom lokalen Dateisystem übernehmen.

## Lokaler Preflight

- Owner-Nummer: lokal gesetzt und nur maskiert ausgegeben
- `WHATSAPP_ENABLED=false`
- Blocker: `WHATSAPP_GRAPH_API_VERSION`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WEBSITE_LEAD_WEBHOOK_SECRET`, `PUBLIC_WEBHOOK_BASE_URL`

## Installation und Test

1. Abhängigkeiten mit `pnpm install --frozen-lockfile` installieren.
2. Lokale Env über `DEUTSCHZ_ENV_FILE` setzen; nie in den Projektordner kopieren.
3. `pnpm check` ausführen.
4. `pnpm preflight:whatsapp` ausführen; Ausgabe darf nur maskierte Werte enthalten.
5. Nach Bereitstellung aller Blocker einen HTTPS-Reverse-Proxy auf `127.0.0.1:8787` einrichten.
6. Meta Verify-Challenge prüfen und genau eine Testnachricht senden.
7. Einen signierten Testlead anlegen und `ANNEHMEN <REQUEST-ID>` von der Owner-Nummer prüfen.
8. Erst nach erfolgreicher Prüfung `WEBSITE_LEAD_WEBHOOK_ENABLED=true`, danach kontrolliert `WHATSAPP_ENABLED=true` setzen.

Details: `tools\DeutschZ-DiscordBot\docs\WEBSITE_WHATSAPP.md` und `tools\DeutschZ-DiscordBot\docs\TESTANLEITUNG.md`.

Discord-Neuaufbau: `tools\DeutschZ-DiscordBot\docs\DISCORD_RESET_REPORT.md`.

## Übertragene Dateien

Die vollständige übertragene Dateiliste einschließlich SHA-256 steht im Ausgabeordner in `OUTPUT_MANIFEST_SHA256.txt`. Übertragen werden ausschließlich Source, gebauter `dist`-Stand, Tests, Dokumentation, Start-/Registrierungsskripte, Package-Metadaten und Containerdateien. Lokale `.env`, Datenbank, Logs, Backups und `node_modules` sind ausgeschlossen.
