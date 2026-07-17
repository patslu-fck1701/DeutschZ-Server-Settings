# RUSForma dependencies and license boundary

RUSForma remains a separate Workshop dependency loaded as `@RUSForma_vehicles`. No RUSForma PBO, BISIGN, key, model, texture, script or config is included in `@DeutschZ_only_core`.

The Workshop description prohibits repacking, taking individual vehicles and monetization without permission. This task only references public config class names through server economy and Expansion Market JSON. That is the safe integration boundary.

No open `requiredAddons[]` declaration is shipped outside the PBOs. Because extraction/decompilation was not authorized, internal addon dependencies were not inferred or invented. Static integration therefore requires the complete original Workshop mod in the client/server mod list.
