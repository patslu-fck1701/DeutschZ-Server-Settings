# Local live-settings synchronization

Source truth is this repository. The checked settings overlay is synchronized to `E:\DeutschZ\DeutschZServer` and the local DayZ server only after XML/JSON validation.

Protected runtime data:

- no `storage_1` deletion or replacement
- no profile log deletion
- no password, token or private signing key copied into the repository
- local ports and profile paths remain local

Patrick performs the full server, gameplay, Expansion Market and economy runtime tests.

Last synchronization: 555 settings files copied from `E:\DeutschZ\DeutschZServer` to the local DayZ server. Excluded: mission `storage_1`, every `Logs`/`LogZ` directory and `*.log`, `*.rpt`, `*.adm`, `*.mdmp`. No delete/mirror operation was used.
