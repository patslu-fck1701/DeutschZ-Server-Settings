# DeutschZ Bot – feste Personen und Rechte

Die vier Personen werden ausschließlich über unveränderliche Discord-User-IDs erkannt. Benutzername, Anzeigename und Pronomen sind keine Berechtigungsquelle.

| Person | Discord-User-ID | Erlaubte Rollen | Befehlsgruppen | FTP-Freigabe | Admin-Ideen | Test/Feedback |
|---|---:|---|---|---|---|---|
| fck1701 | `680138829965164553` | Inhaber | alle Gruppen einschließlich Owner-only | JA; eigene Anfrage ohne Vier-Augen-Freigabe | JA, finale Statusentscheidung | JA |
| Halftan | `769953999163621397` | Projektleitung | Verwaltung, Modding, Events und Freigaben; keine Owner-only-Umgehung | JA; Vier-Augen-Prinzip | JA | JA |
| DevilMagic | `526160792538710016` | Projektleitung | Verwaltung, Modding, Events und Freigaben; keine Owner-only-Umgehung | JA; Vier-Augen-Prinzip | JA | JA |
| Ronny1996 (GHOST) | `424575219219562503` | DeutschZ Ehrenmitglied | keine kritischen Befehlsgruppen | NEIN | Feedback, keine Statusentscheidung | JA |

## Verbindliche Regeln

- `OWNER_USER_ID` ist die alleinige Owner-only-Identität.
- `APPROVER_USER_IDS` enthält ausschließlich die drei Hauptfreigeber.
- Ronny erhält keine Upload-, Lösch-, Deployment-, Backup- oder Raid-Freigabe.
- Rollen können allgemeine Arbeitsrechte gewähren. Eine namentlich festgelegte Person wird jedoch niemals über Rollenname, Username oder DisplayName erkannt.
- Zusätzliche FTP-Arbeitsrollen werden ausschließlich als Discord-Rollen-IDs über `DISCORD_ADMIN_ROLE_IDS` konfiguriert; leere Konfiguration gewährt niemandem zusätzliche FTP-Rechte.
- Kritische Befehle werden bei Ausführung erneut serverseitig geprüft und in `security_audit` protokolliert.
