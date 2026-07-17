# WebsitePublisher-Anfragen über WhatsApp

## Status und Sicherheitsgrenze

Die Integration verwendet ausschließlich die offizielle WhatsApp Business Cloud API. Es gibt keinen WhatsApp-Web-Scraper, keine Browserautomation, keine Gruppenintegration und keine inoffizielle Clientbibliothek. Website-Leads werden lokal dauerhaft gespeichert; es existiert keine künstliche Obergrenze für die Anzahl gespeicherter Leads.

Liveversand bleibt standardmäßig deaktiviert. `WHATSAPP_ENABLED=false` und unvollständige Meta-Werte verhindern jede echte Nachricht.

## Endpunkte

- `POST /webhooks/websitepublisher/leads`
- `GET /webhooks/whatsapp` für Metas Verify-Challenge
- `POST /webhooks/whatsapp` für eingehende Statusbefehle

Der Node-Prozess bindet standardmäßig nur an `127.0.0.1:8787`. Die öffentliche Adresse muss über einen vorhandenen HTTPS-Reverse-Proxy bereitgestellt werden. Niemals Port 8787 ungefiltert ins Internet freigeben.

## WebsitePublisher-Signatur

Erforderliche Header:

```text
Content-Type: application/json
X-WebsitePublisher-Timestamp: <Unixzeit in Sekunden>
X-WebsitePublisher-Signature: sha256=<hex-hmac>
Idempotency-Key: <eindeutige Ereignis-ID>
```

Signierter Inhalt:

```text
HMAC-SHA256(WEBSITE_LEAD_WEBHOOK_SECRET, "<timestamp>.<exakter HTTP-Body>")
```

Akzeptierte Formulare: `auftrag`, `support`, `preisvorschlag`. Timestamp-Fenster, Payloadlimit und Rate-Limit sind konfigurierbar. Ein bereits verwendeter Idempotency-Key wird nicht erneut verarbeitet; eine bereits gespeicherte Anfrage erzeugt keine zweite Queue-Nachricht.

Beispielbody:

```json
{
  "external_request_id": "REQ-20260718-0001",
  "form_name": "auftrag",
  "name": "Max Mustermann",
  "discord_name": "max",
  "email": "max@example.invalid",
  "request_type": "DayZ-Mod",
  "budget": "offen",
  "message": "Beschreibung der Anfrage",
  "created_at": "2026-07-18T12:00:00+02:00"
}
```

## WhatsApp-Befehle

Nur die normalisierte E.164-Nummer aus `WHATSAPP_OWNER_PHONE_NUMBER` ist berechtigt:

- `ANNEHMEN <REQUEST-ID>`
- `ABLEHNEN <REQUEST-ID>`
- `START <REQUEST-ID>`
- `ERLEDIGT <REQUEST-ID>`
- `STATUS <REQUEST-ID>`
- `OFFEN`
- `OFFEN <SEITE>`
- `SUCHE <TEXT>`

`OFFEN` liefert höchstens zehn Einträge pro Seite. Fremde Absender verändern keinen Status und erhalten keine internen Daten.

## Queue, Retry und Duplikatschutz

- Ein Lead besitzt höchstens einen Queue-Eintrag.
- Versand wird vor dem API-Aufruf persistent auf `SENDING` gesetzt.
- Cloud-API-Fehler verwenden exponentielles Backoff und maximal fünf Versuche.
- Nach Erreichen des Limits bleibt der Lead als `FAILED` sichtbar.
- Findet ein Bot-Neustart während `SENDING` statt, wird der Versand auf `UNKNOWN` gesetzt und nicht automatisch wiederholt. So wird eine mögliche Doppelzustellung nach einem unklaren API-Ergebnis vermieden.
- Jede Annahme, Ablehnung, Statusänderung, Zustellung und jeder Retry wird lokal auditiert.

## Lokale Aktivierung

Reale Werte ausschließlich in der lokalen Runtime-`.env` hinterlegen:

```env
WHATSAPP_OWNER_PHONE_NUMBER=+49...
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_GRAPH_API_VERSION=
WEBSITE_LEAD_WEBHOOK_SECRET=
PUBLIC_WEBHOOK_BASE_URL=https://...
WEBSITE_LEAD_WEBHOOK_ENABLED=false
WHATSAPP_ENABLED=false
```

Preflight:

```powershell
$env:DEUTSCHZ_ENV_FILE='C:\Pfad\zur\lokalen.env'
pnpm preflight:whatsapp
```

Erst wenn der Preflight keinen Blocker meldet:

1. HTTPS-Reverse-Proxy auf den lokalen Listener einrichten.
2. Meta-Verify-Webhook testen.
3. `WEBSITE_LEAD_WEBHOOK_ENABLED=true` setzen und Bot neu starten.
4. Genau eine offizielle Testnachricht senden.
5. Einen Testlead mit gültiger HMAC-Signatur erstellen.
6. `ANNEHMEN <REQUEST-ID>` von der Owner-Nummer prüfen.
7. Erst nach erfolgreichem Audit `WHATSAPP_ENABLED=true` setzen.

Der Bot aktiviert diese Werte niemals selbstständig.

## Datenschutz

Tokens, Secrets und Telefonnummer werden weder in Discord noch in Logs ausgegeben. Diagnoseausgaben maskieren die Owner-Nummer. Lead-Inhalte bleiben in der lokalen Botdatenbank und werden ausschließlich an die konfigurierte Owner-Nummer gesendet. Discord- und E-Mail-Spiegelung bleiben deaktiviert.
