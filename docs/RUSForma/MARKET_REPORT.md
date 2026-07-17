# RUSForma Expansion Market report

Six categories are generated from the 242 confirmed vehicle/variant classes:

- Civilian: 92
- Utility: 66
- Offroad: 34
- Military: 30
- Armored: 17
- Special: 3

41 prices come from the open RUSForma vehicle trader list. 201 unlisted variants use category defaults documented in `MARKET_PRICE_MATRIX.csv`.

Trader assignment:

- Regular `Vehicles.json`: Civilian, Utility, Offroad
- `Blackmarket_Vehicles.json`: Military, Armored, Special

All generated categories use the existing Expansion Market v12 item schema. Static JSON validation does not prove the in-game trader UI, purchase or spawn-attachment behavior; Patrick performs those runtime tests.
