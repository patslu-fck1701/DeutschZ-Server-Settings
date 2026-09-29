# DeutschZ Fahrzeugschaden – Balance und VehicleSettings

## Ziel

Fahrfehler sollen wirtschaftlich spürbare Folgen haben, ohne normale Rangierfehler oder einzelne DayZ-Physik-Aussetzer übermäßig hart zu bestrafen. Reparaturteile, Händler und Fahrzeugneukauf sollen einen echten Zweck haben.

## Verbindlicher Teststand

Die vollständige Konfiguration liegt unter:

`settings/shared/ExpansionMod/Settings/VehicleSettings.json`

Geänderte Balancewerte gegenüber dem zuvor verwendeten Stand:

- `VehicleCrewDamageMultiplier`: 0.65 -> 0.80
- `VehicleSpeedDamageMultiplier`: 0.75 -> 1.10
- `CollisionDamageMinSpeedKmh`: 15.0 -> 12.0
- `DesyncInvulnerabilityTimeoutSeconds`: 3.0 -> 4.0
- `RoughLandingVerticalSpeedThreshold`: 4.8 -> 4.2
- `DamagedEngineStartupChancePercent`: 100.0 -> 70.0

Unverändert aktiv bleiben unter anderem Fahrzeugschaden, Haupt-/Heckrotorschaden, Helikopterexplosionen, Schaden bei ausgeschaltetem Motor sowie das Abwerfen ruinierter Türen und Anhänge.

## Gewünschtes Spielverhalten

- 5–10 km/h: kleine Rempler sollen praktisch folgenlos bleiben.
- 20–30 km/h: leichter Schaden ist akzeptabel.
- 40–60 km/h: sichtbarer und reparaturwürdiger Schaden.
- 70–90 km/h gegen Baum/Mauer: schwerer Schaden; Fahrzeug kann fahruntüchtig werden.
- 100+ km/h frontal: Totalschaden muss möglich und plausibel sein.
- Helikopter: kleine unsaubere Landungen überlebbar, harte Landungen mit echten Folgen.
- Lag/Desync darf nicht der Hauptgrund für Fahrzeugverluste sein; deshalb 4 Sekunden Desync-Schutz.

## Testmatrix vor Live-Freigabe

1. Expansion-/Vanilla-Fahrzeug mit ca. 25 km/h gegen festes Hindernis.
2. Dasselbe Fahrzeug mit ca. 50 km/h.
3. Dasselbe Fahrzeug mit ca. 90 km/h.
4. Kontrollieren: Motor, Karosserie, Türen, Räder und Insassenschaden.
5. Vergleichstest mit mindestens einem Drittanbieter-Fahrzeug.
6. Heli-Landung einmal sauber, einmal grenzwertig und einmal absichtlich hart.
7. RFFS Apache oder UH-1H gesondert prüfen, weil Drittanbieter-Fahrzeuge eigene Damage-/Physics-Werte haben können.
8. RPT/Script-Logs nach jedem Test auf Fehler prüfen.
9. Wenn Expansion-Fahrzeuge Schaden nehmen, einzelne Modfahrzeuge aber nicht, nicht global weiter hochskalieren; stattdessen die jeweilige Mod-Konfiguration prüfen.

## Freigaberegel

Dieser Stand ist vorbereitet, aber erst nach lokalem/Praxis-Test als Live-Baseline zu markieren. Kein Merge nach `main`, solange die Tests nicht nachvollziehbar bestanden wurden.

## Rollback

Vor Live-Deployment die aktuell laufende `VehicleSettings.json` außerhalb des Repositories sichern. Bei unerwartetem Verhalten Server stoppen, vorherigen Stand zurückspielen, starten und Logs sowie Fahrzeugtests wiederholen.
