# Slash-Command-Audit

Geprüfter Ausgangsstand: 59 Commands. Ergebnis: 57 eindeutige Commands.

Entfernte Doppelungen:

- `/health` war ein zweiter, unklar benannter Botstatus. Der sichere öffentliche Status heißt jetzt ausschließlich `/bot-status`.
- `/mods-list` war funktional identisch mit `/mods`. Die öffentliche Modliste heißt jetzt ausschließlich `/mods`.

## Spieler

`/bot-status`, `/mods`, `/restart-next`, `/github-status`, `/github-latest`, `/github-links`, `/suggest`

Diese Commands liefern keine Tokens, Passwörter, lokalen Pfade, Datenbankinhalte, Steam64-IDs oder internen Sicherheitsdaten.

## Events

`/event-create`, `/event-list`, `/event-edit`, `/event-cancel`, `/event-remind`, `/event-panel`, `/notify-kothz`, `/giveaway-result`

Alle Verwaltungsaktionen benötigen `ManageGuild`, werden zur Laufzeit erneut geprüft und auditieren Start, Erfolg oder Fehler. Öffentliche Posts sind beabsichtigte Ausgaben; die Befehlsbestätigung bleibt ephemer.

## Moderation

`/warn`, `/warnings`, `/warn-remove`, `/timeout`, `/untimeout`, `/kick`, `/ban`, `/unban`, `/clear`, `/slowmode`, `/nickname-reset`, `/modnote`

Discord-Berechtigungen werden beim Command und die Rollenposition nochmals zur Laufzeit geprüft. Antworten mit Fallinformationen sind ephemer. Aktionen werden in Moderations- und Sicherheitsaudit gespeichert.

## Servermanagement

`/setup-deutschz`, `/setup-status`, `/sync-all`, `/config-view`, `/status-refresh`, `/notification-status`, `/announce`, `/maintenance-announce`, `/maintenance-start`, `/maintenance-complete`, `/server-panel`, `/verify-panel`, `/roles-panel`, `/ticket-panel`, `/restart-test`, `/permissions-check`, `/database-status`, `/backup-create`

Owner-only: `/setup-deutschz`, `/setup-status`, `/config-view`, `/database-status`, `/backup-create`, `/raid-mode`. Die feste Owner-ID wird unabhängig vom Anzeigenamen geprüft. `config-view` verwendet ausschließlich maskierte Statuswerte.

## Modding

`/mod-release`, `/mod-changelog`, `/mods-add`, `/mods-remove`, `/mods-edit`, `/mods-refresh`

Verwaltung benötigt `ManageGuild`, Runtimeprüfung und Audit. Workshop-/Repository-Links werden nur dargestellt, niemals automatisch installiert.

## FTP/Deploy

`/upload`, `/deploy`, `/push-settings`, `/push-mod`, `/push-file`

Alle Commands sind standardmäßig nicht öffentlich, prüfen User-ID beziehungsweise konfigurierte Rollen-ID erneut und erzeugen nur eine Freigabeanfrage. Effektive Aktivierung erfordert gleichzeitig `UPLOAD_ENABLED=true` und `FTP_UPLOAD_ENABLED=true`. Beide bleiben standardmäßig `false`. Es existiert kein produktiver FTP-Client.

## Owner-only

`/raid-mode` sowie die oben genannten sensitiven Servermanagement-Commands.

## Fehlerbehandlung und sensible Ausgaben

- Jede Interaction läuft durch die zentrale Fehlerbehandlung.
- Kritische Commands antworten ephemer, soweit sie nicht ausdrücklich einen öffentlichen Community-Post erzeugen.
- `security_audit` enthält User-ID, Command, Ergebnis und gekürzte Fehlermeldung, aber keine Command-Optionen, Tokens, Passwörter oder Dateiinhalte.
- Uploaddetails sind nur ephemer sichtbar; Secrets und private Schlüssel werden bereits im Preflight blockiert.
