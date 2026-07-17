# DeutschZ Discord Bot – Abnahmetest

## Automatisch

```powershell
pnpm install --frozen-lockfile
pnpm check
```

Erwartung: ESLint, 6 Vitest-Dateien mit 31 Tests und TypeScript-Build bestehen.

## Discord

1. `/bot-status`, `/mods`, `/restart-next` als normaler Nutzer prüfen.
2. Owner-only-Command mit einer anderen Person aufrufen: muss serverseitig abgelehnt werden.
3. `/config-view` als Owner prüfen: nur maskierte Statuswerte, keine Telefonnummer, Tokens, Secrets oder lokalen Zugangsdaten.
4. FTP-Command prüfen: Er darf höchstens eine Anfrage erzeugen; kein Live-FTP-Transfer.
5. Bestehende Panels, Tickets, Rollenwahl, Moderation und Events regressionstesten.

## WhatsApp-Preflight

```powershell
$env:DEUTSCHZ_ENV_FILE='C:\Users\patsl\Downloads\DeutschZ-DiscordBot.env'
pnpm preflight:whatsapp
```

Bis zur Meta-Konfiguration erwartet:

- Owner-Nummer nur maskiert
- WhatsApp-Benachrichtigung JA
- Discord NEIN
- E-Mail NEIN
- Live WhatsApp NEIN
- fehlende Werte als Aktivierungsblocker

## Manueller Live-Test – erst nach vollständigem Preflight

1. HTTPS-Reverse-Proxy und Meta Verify-Challenge prüfen.
2. Genau eine Testnachricht an die Owner-Nummer senden.
3. Einen gültig signierten Testlead mit einmaligem Idempotency-Key absenden.
4. Genau eine WhatsApp-Nachricht erwarten.
5. `ANNEHMEN <REQUEST-ID>`, `STATUS <REQUEST-ID>`, `START <REQUEST-ID>` und `ERLEDIGT <REQUEST-ID>` prüfen.
6. `OFFEN`, `OFFEN 2` und `SUCHE <TEXT>` prüfen.
7. Dieselbe Anfrage erneut senden: keine zweite Queue-Nachricht.
8. Fremde Telefonnummer versucht Statusänderung: keine Daten und keine Änderung.
9. Ungültige HMAC, alter Timestamp, übergroßer Body und unbekanntes Formular: Ablehnung.
10. API-Fehler simulieren: Retry sichtbar, keine Discord-/E-Mail-Spiegelung.

Erst nach allen zehn Punkten darf `WHATSAPP_ENABLED=true` bleiben.
