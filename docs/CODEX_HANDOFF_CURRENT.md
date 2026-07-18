# CODEX HANDOFF CURRENT

Aktualisiert: 18.07.2026

## Aktiver Stand

Der DeutschZ-Discord wurde bereinigt und vollständig neu aufgebaut. Alle Text- und Ankündigungskanäle enthalten eine angepinnte Startinformation. Der Bot ist mit genau einer Instanz als `DeutschZs-littleHelperZ#6665` verbunden. Patricks Sicherheits- und FTP-Verantwortungsbestätigung ist gespeichert; Halftan, DevilMagic, Ronny und Tschuby stehen noch auf ausstehend.

WebsitePublisher ist live aktualisiert: Community-/Schildwall-Seite, Teamdarstellung, besonderer Dank an Halftan und DevilMagic, Ehrenmitglieder, Spendenlink, WhatsApp-Kontakt, Eventmotive, Infizierten-Assets und elf aktuelle Musiktitel. Startseite, Community, Media, Support, News, 19 Bildreferenzen und alle elf Audiodateien liefern HTTP 200.

## Source

- Worktree: `E:\DeutschZ\DeutschZ-Worktrees\DiscordBot`
- Projekt: `E:\DeutschZ\DeutschZ-Worktrees\DiscordBot\tools\DeutschZ-DiscordBot`
- Branch: `codex/discord-market-schildwall-20260718`

## Ausgabe

- Ziel: `E:\DeutschZ\DeutschZServer\DeutschZ-DiscordBot`
- Source bleibt im Git-Repository.
- Lokale `.env`, Datenbank, Logs, Backups, Tokens und `node_modules` werden nicht übertragen.

## Technischer Status

- ESLint: PASS
- Vitest: 6 Dateien / 31 Tests PASS
- TypeScript-Build: PASS
- Discord-Verbindung: PASS, eine Instanz
- Slash-Commands: 63 Guild-Commands registriert
- Discord-Duplikate: 0 Kategorien, 0 Kanäle, 0 Rollen
- Market-Sync: 92 Kategorien, 2609 Items, 24 Händler, 0 Warnungen, 0 Fehler
- Market-ID-Fehler behoben: neue Imports verwenden die tatsächlich persistierte Import-ID
- FTP-Konfiguration: vorhanden
- FTP-Upload: aktiviert, aber nur nach Approval-Workflow, Allowlist, Hashprüfung und Audit
- Vier-Augen-Prinzip: Standard; fck1701 besitzt den ausdrücklich freigegebenen Owner-Override
- Website-HMAC, Replay-Schutz, persistente Lead-Queue und Mocktests: PASS
- WhatsApp Cloud API-Client: implementiert, echter Versand deaktiviert
- Website: live aktualisiert und per HTTP geprüft

## Noch offene Aktivierungsblocker

Für echten WhatsApp-Business-Versand fehlen weiterhin die realen Meta-/Webhook-Werte. Bis dahin bleiben `WHATSAPP_ENABLED=false` und der externe Website-Lead-Webhook deaktiviert. Es wird kein inoffizieller WhatsApp-Web-Client verwendet.

## Installation und Test

1. `pnpm install --frozen-lockfile`
2. Lokale Env nur über `DEUTSCHZ_ENV_FILE` setzen.
3. `pnpm check`
4. Bot starten und im Log genau eine Zeile `DeutschZ Bot verbunden` für die aktive PID prüfen.
5. Einen ausstehenden Verantwortungsbutton anklicken und die gespeicherte Bestätigung im Audit prüfen.
6. FTP zunächst mit einer unkritischen Testdatei innerhalb der Allowlist und vollständigem Approval testen.
7. WhatsApp erst nach vollständigem Meta-Preflight aktivieren.

Details stehen unter `tools\DeutschZ-DiscordBot\docs`.
