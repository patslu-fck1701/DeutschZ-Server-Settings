# Deployment-Checkliste

## Vor dem Deployment

- [ ] Zielversion und Commit notiert
- [ ] Live-Backup außerhalb des Repositories erstellt
- [ ] geänderte Dateien eindeutig identifiziert
- [ ] keine Zugangsdaten im Commit
- [ ] JSON validiert
- [ ] XML validiert
- [ ] Abhängigkeiten und Mod-Reihenfolge geprüft
- [ ] lokaler Serverstart erfolgreich
- [ ] relevante Logs ohne blockierende Fehler
- [ ] Rollback vorbereitet
- [ ] Wartungsfenster festgelegt

## Deployment

- [ ] Server sauber heruntergefahren
- [ ] nur vorgesehene Settings übertragen
- [ ] Dateirechte und Pfade geprüft
- [ ] Server gestartet
- [ ] Startlog kontrolliert
- [ ] Mission vollständig geladen
- [ ] Admin-Zugang geprüft
- [ ] Kernfunktionen getestet

## Nach dem Deployment

- [ ] Expansion Notify und Marker geprüft
- [ ] KotHZ geprüft
- [ ] ConvoyZ geprüft
- [ ] Economy/Trader stichprobenartig geprüft
- [ ] Restart-Verhalten geprüft
- [ ] Fehler und Abweichungen dokumentiert
- [ ] stabilen Commit getaggt
- [ ] Changelog ergänzt

## Rollback

- [ ] Server stoppen
- [ ] vorherigen geprüften Stand wiederherstellen
- [ ] Server starten
- [ ] Logs und Kernfunktionen prüfen
- [ ] Ursache separat analysieren
