# RUSForma / only_core static validation

Result: PASS

- XML parser: repository, central output and local server PASS
- JSON parser: six Market categories and both changed traders PASS
- Encoding: changed Market/Trader JSON UTF-8 without BOM PASS
- Source match: 242/242 generated CE classes found in the visible Workshop types file
- CE duplicates: 0
- Market duplicates across all Market categories: 0
- Trader assignment: regular and blackmarket categories exclusive and complete
- Mod list: 22 unique entries; `@RUSForma_vehicles` directly before `@DeutschZ_only_core`
- Local mod paths: 22/22 exist
- only_core contents: exactly 3 PBOs, 3 DeutschZ BISIGNs, 1 DeutschZ BIKEY
- only_core signatures: 3/3 PASS in central output and local server
- KotHZ Preflight: 0 errors; one known Windows path-uppercase warning
- KotHZ clean build/sign: PASS
- KotHZ PBO contents: settings/event scripts plus active flag, chest and firework PAA present
- RUSForma Workshop files: read-only; no PBO repack or modification

Not executed by explicit user correction: full server run, vehicle spawn, Market purchase/sale, economy runtime and Gameplay/visual test.
