# DeutschZ Discord Bot – Abnahmetest

## Automatisch

```powershell
pnpm install --frozen-lockfile
pnpm check
```

Erwartung: ESLint, 6 Vitest-Dateien mit 31 Tests und TypeScript-Build bestehen.

## Discord und Bestätigung

1. Prüfen, dass genau eine Bot-Instanz läuft.
2. Einen noch ausstehenden Button `GELESEN UND VERSTANDEN` anklicken.
3. Erwartung: Button verschwindet, Bestätigungszeit wird angezeigt und `security_audit` enthält `responsibility-ack`.
4. Erneuter Klick auf eine alte Nachricht darf keine zweite Bestätigung erzeugen.
5. Owner-only-Command mit einem fremden Nutzer aufrufen: serverseitige Ablehnung.
6. Kritische Antworten bleiben ephemer und enthalten keine Secrets oder lokalen Zugangsdaten.

## FTP

1. Nur Quelle und Ziel innerhalb der konfigurierten Allowlists verwenden.
2. `.env`, private Schlüssel und Credential-Dateien müssen im Preflight blockiert werden.
3. Nicht-Owner: zweiter berechtigter Freigeber erforderlich.
4. fck1701: ausdrücklicher Owner-Override zulässig.
5. Nach Freigabe Hash erneut prüfen; geänderte Datei muss eine neue Anfrage erfordern.
6. Temp-Upload, Zielprüfung, Backup und Rollback mit einer unkritischen Testdatei prüfen.

## Website

Prüfen:

- `/`, `/community.html`, `/media.html`, `/support.html`, `/news.html`
- Schildwall, Teamdarstellung, Spendenlink und WhatsApp-Kontakt
- vier Eventmotive und sechs Infiziertenbilder
- elf Musiktitel; keine alten Audioquellen

## WhatsApp

Bis zur vollständigen Meta-Konfiguration erwartet:

- Owner-Nummer nur maskiert
- `WHATSAPP_ENABLED=false`
- keine echte Nachricht
- fehlende Werte als Aktivierungsblocker

Erst nach vollständigem Preflight Meta-Webhook verifizieren, genau eine Testnachricht senden und einen signierten Testlead samt `ANNEHMEN <REQUEST-ID>` prüfen.
