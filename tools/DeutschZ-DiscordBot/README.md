# DeutschZ Discord Bot

Produktionsfähiger Discord-Community-Bot für den DeutschZ DayZ-PC-Server. Er verwaltet Discord-Struktur, Verifizierung, Rollen, Tickets, Moderation, Vorschläge, Events, Modliste, Serverstatus und Restart-Erinnerungen. Discord wird erst verändert, wenn ein berechtigter Nutzer `/setup-deutschz` ausführt und den Bestätigungsbutton anklickt.

## Sicherheit

- `.env`, Desktop-`env`, Datenbanken, Logs und Backups werden nicht committed.
- Logs maskieren Token-, Passwort-, Secret- und Authorization-Felder.
- `/config-view` zeigt nur `gesetzt` oder `fehlt`.
- GitHub ist nur lesend eingebunden. Social Media und Killfeed sind ohne offizielle Quelle deaktiviert.

## Installation unter Windows

1. Node.js 20 oder neuer und pnpm installieren.
2. `pnpm install --frozen-lockfile`
3. `.env.example` nach `.env` kopieren und die Discord-Werte lokal eintragen. Alternativ lädt `scripts/Start-DeutschZBot.ps1` die vorhandene Datei `Desktop\env`, ohne sie zu kopieren.
4. `pnpm migrate`
5. `pnpm register`
6. `pnpm build`
7. `powershell -ExecutionPolicy Bypass -File scripts\Start-DeutschZBot.ps1`

Für die vorhandenen Variablen `CLIENT_ID`, `GUILD_ID` und `CHANNEL_ID` existieren rückwärtskompatible Aliase. Für die echte Verbindung ist zusätzlich `DISCORD_TOKEN` erforderlich.

## Discord Developer Portal

Grundlegende Intents: `Guilds`, `Guild Moderation` und `Guild Messages`. Für die vollständige Begrüßung `Server Members Intent` im Portal aktivieren und `DISCORD_GUILD_MEMBERS_INTENT=true` setzen. Für vollständige Ticket-Transkripte `Message Content Intent` aktivieren und `DISCORD_MESSAGE_CONTENT_INTENT=true` setzen. Ohne Portal-Freigabe bleiben beide Flags `false`, damit Discord die Verbindung nicht blockiert. Empfohlene Botrechte: Manage Channels, Manage Roles, Manage Messages, Moderate Members, Kick/Ban Members, View Audit Log, Send Messages, Embed Links, Attach Files, Read Message History und Use Application Commands. Die Botrolle muss oberhalb aller verwalteten Rollen stehen.

## Erste Einrichtung

1. Bot starten und Slash Commands mit `pnpm register` registrieren.
2. Als Serverinhaber `/permissions-check` ausführen.
3. `/setup-deutschz` ausführen, Vorschau lesen und bestätigen.
4. `/verify-panel`, `/roles-panel`, `/ticket-panel`, `/server-panel` und `/event-panel` prüfen.
5. `DAYZ_QUERY_PORT` erst fest eintragen, wenn der tatsächliche A2S-Port bestätigt wurde. Ohne bestätigten Query-Port zeigt der Bot neutral „Statusabfrage derzeit nicht verfügbar“ statt fälschlich „offline“.

Bestätigungspflichtige Struktur- und Löschaktionen akzeptieren nur den Discord-Serverinhaber oder die in `APPROVER_USER_IDS` hinterlegten DeutschZ-Hauptfreigebenden. `OWNER_USER_ID` erhält als einziger fachlicher Inhaber automatisch die Rolle `Inhaber`; weitere Hauptfreigebende erhalten `Projektleitung`. Anzeigenamen werden nicht als Sicherheitsmerkmal verwendet.

## Daten, Backup und Restore

SQLite liegt standardmäßig in `data/deutschz.sqlite`. `/backup-create` oder `scripts/Backup-DeutschZBot.ps1` erzeugt rotierte Backups ohne `.env`. Zum Restore den Bot stoppen, die aktuelle Datenbank extern sichern, das gewünschte Backup nach `data/deutschz.sqlite` kopieren, `pnpm migrate` und danach den Bot starten.

## Updates

Bot stoppen, Arbeitsbranch aktualisieren, `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm migrate`, `pnpm build`, `pnpm register` und anschließend kontrolliert starten. Die SQLite-Datenbank wird durch wiederholbare Migrationen erhalten.

## Docker

Eine lokale `.env` anlegen und `docker compose up -d --build` ausführen. Secrets werden nur zur Laufzeit eingebunden und nicht in das Image kopiert.

## Einschränkungen

- Social Media bleibt ohne offizielle Plattform-API deaktiviert.
- Killfeed bleibt ohne sichere bereitgestellte Logquelle deaktiviert.
- Eine echte Discord-Abnahme und das zweifache Ausführen des Setup-Befehls benötigen einen gültigen Bot-Token und Serverzugriff.
- Ticket-Transkripte werden im produktiven Kanalverlauf erhalten; ein zusätzlicher Dateiexport wird bei der manuellen Discord-Abnahme geprüft.
WebsitePublisher-Anfragen können über einen signierten lokalen Webhook dauerhaft gespeichert und über die offizielle WhatsApp Business Cloud API an den fest konfigurierten Inhaber gemeldet werden. Liveversand ist standardmäßig deaktiviert. Einrichtung und Aktivierungsgrenzen: [docs/WEBSITE_WHATSAPP.md](docs/WEBSITE_WHATSAPP.md).
