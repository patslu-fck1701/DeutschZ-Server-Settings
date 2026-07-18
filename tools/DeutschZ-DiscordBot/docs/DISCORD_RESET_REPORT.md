# DeutschZ Discord-Neuaufbau – Live-Verifikation

Stand: 18.07.2026

Der autorisierte vollständige Neuaufbau des Discords wurde erfolgreich ausgeführt und anschließend erneut ausschließlich lesend gegen den Live-Guild geprüft.

## Live-Bestand

- Kategorien: 11
- Kanäle: 63
- eigene Rollen: 32
- doppelte Kategorienamen: 0
- doppelte Kanalnamen: 0
- doppelte Rollennamen: 0
- geschützte Discord-Community-Kanäle `👋・willkommen` und `📜・regelwerk` wurden erhalten und in die neue Struktur übernommen.

## Feste Zuweisungen

- `680138829965164553`: Inhaber
- `769953999163621397`: Projektleitung
- `526160792538710016`: Projektleitung
- `424575219219562503`: DeutschZ Ehrenmitglied und Supporter

Personen werden ausschließlich über ihre Discord-User-ID erkannt. Ronny besitzt die vollständigen Supporter-Rechte, aber keine Hauptfreigabe-, FTP-, Deployment-, Backup-, Raid- oder Owner-Rechte.

## Technischer Nachweis

- `pnpm lint`: PASS
- `pnpm test`: 6 Dateien / 31 Tests PASS
- `pnpm build`: PASS
- Live-Verifikation nach Reset: PASS

Die Laufzeit-Auditdateien liegen nur lokal unter `data/discord-reset-audit/` und werden weder committed noch in den Ausgabeordner übertragen.
