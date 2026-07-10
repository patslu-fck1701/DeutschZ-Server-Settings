===========================================
  SprayZ - Configuration Guide
===========================================

=== SERVER FILES ===

Config files (you edit these):
  SprayZ_Config.json       - Server settings (limits, permissions, commands, toggles)
  SprayZ_Designs.json      - Designs, quest requirements, quest objective filters

Auto-generated files (do not edit):
  SprayZ_Graffiti.json     - Placed graffiti persistence data
  SprayZ_Collection.json   - Per-player graffiti collection (pokedex) data
  SprayZ_Unlocks.json      - Per-character design unlock persistence
  SprayZ_Log.txt           - Action log (placements, removals, admin actions)
  SprayZ_Config_README.txt - This file
  SprayZ_Quest_Guide.txt   - Quest setup walkthrough + full filter parameter reference

SprayZ_Designs.json auto-merges on mod update: new designs added, removed designs cleaned up, your quest settings preserved.
SprayZ_Config.json auto-merges on mod update: new settings added with defaults, your existing values preserved.
Delete SprayZ_Designs.json to regenerate with defaults (resets quest requirements).
Delete SprayZ_Config.json to regenerate with default settings.
Delete SprayZ_Collection.json to reset all player collections.
Delete SprayZ_Unlocks.json to reset all character design unlocks.


=== SprayZ_Config.json ===

--- General ---
QuantityCostPerUse: Paint consumed per spray (default: 20, max: 100)
MaxGraffitiPerPlayer: Max placed graffiti per player (default: 5)
EnablePersistence: Graffiti survives server restarts (default: true)

--- Server Limits ---
MaxGraffitiTotal: Server-wide cap. 0 = unlimited (default: 0)
OverLimitBehavior: block, remove_oldest, or remove_player_oldest (default: remove_oldest)
SprayCooldownSeconds: Seconds between sprays. 0 = no cooldown (default: 0)
SprayDurationSeconds: How long the spray action takes in seconds (default: 4.0). Sound files are 19s long - values above 19 will have silence after the sound ends.
CleanDurationSeconds: How long the clean action takes in seconds (default: 8.0)
SplashDurationSeconds: How long the water splash action takes in seconds (default: 2.0)

--- Sponge ---
SpongeCleanDurationSeconds: How long cleaning with a sponge takes in seconds (default: 5.0)
SpongeMaxUses: How many graffiti a fully-wet sponge can clean (default: 10, capped by engine at 30).
  Water cost to fully wet a dry sponge is 50 ml * SpongeMaxUses, so default = 500 ml (half a canteen).
  Per-use water cost (50 ml) is hardcoded so the cost-per-clean stays consistent across servers.
SplashWaterCost: Water consumed (ml) per splash to fade graffiti (default: 50)

--- Permissions ---
CleanPermission: anyone, owner, or owner_and_admin (default: anyone)
InspectPermission: anyone, admin, or disabled (default: anyone)

--- Inspect Format ---
InspectFormat: Controls what players see when inspecting graffiti
  full        - Design name, player name, and age (default)
  anonymous   - Design name and age only
  design_only - Design name only
  silent      - No message. Shows 'New design discovered!' on first find only
  Admins always see full details with [ADMIN ONLY] tag.

--- Per-Character Mode (RP Servers) ---
CollectionPerCharacter: Ties collection and unlocks to UID + character name (default: false)
  When true, new characters start with empty collection and locked designs.
  Design-unlock quests must be set to Repeatable: 1 in Expansion.
  Our mod blocks re-acceptance on characters that already have the unlocks.

--- Expiry and Decay ---
GraffitiLifetimeHours: Hours before auto-expire. 0 = never (default: 0)
EnableDecay: Visual fade over lifetime (default: true). Requires GraffitiLifetimeHours > 0
DecayCheckIntervalMinutes: How often decay updates (default: 15). 0 = only on restart
RainDecayMultiplier: Decay speed in rain for exposed graffiti (default: 2.0). 1.0 = disabled

--- Reactive Glow ---
EnableReactiveGlow: Glow graffiti dims during day, glows at night (default: true)
ReactiveCheckIntervalSeconds: Check interval (default: 30)
NightStartHour / NightEndHour: Glow active hours (default: 20.0 / 5.0)

--- Admin ---
EnableAdminPermanentPlace: Admins can toggle permanent spray mode (default: true)
AdminPlaceCommand: Command to toggle (default: /graffitiplace)
ClearAllIncludesPermanent: Whether clear commands remove permanent graffiti (default: false)

--- Quest Integration ---
--- Discovery ---
EnableDiscoverySound: Play a chime when discovering a new graffiti design (default: true)

EnableQuestRequirements: Lock designs behind Expansion Quest completion (default: false)
  Requires DayZ-Expansion-Quests. If not loaded, all designs available.

--- Logging ---
EnableLogging: Log all actions to SprayZ_Log.txt (default: true)

--- Chat Commands ---
All commands also work with ! prefix.
ReloadCommand: Reload config (admin). Default: /graffitireload
StatusCommand: Show stats. Default: /graffitistatus
RemoveCommand: Remove nearest graffiti (admin). Default: /graffitiremove
ClearAllCommand: Remove all graffiti (admin). Default: /graffiticlearall
ClearRadiusCommand: Remove within radius (admin). Default: /graffiticlear
AdminPlaceCommand: Toggle permanent mode (admin). Default: /graffitiplace

--- Custom Text (typed message) ---
MessageBlacklist: Array of exact messages (case-insensitive) that players cannot
  spray via the Message tab. Matching rejects the whole message with a player-facing
  error. Admins bypass the list while in admin place mode. Example:
    "MessageBlacklist": ["SLUR1", "SLUR2", "ASSHAT"]


=== SprayZ_Designs.json ===

--- Designs ---
Array of available designs. Each: { Name, TexturePath }
Textures must be in a PBO that clients load.

--- DiscoveryLockedDesigns ---
Array of design names that are hidden until discovered by inspecting another player's spray.
These designs unlock automatically on first discovery (no quest needed).
Example: ["Pentagram", "Star", "Triple Moon"]

--- QuestRequirements ---
Lock designs behind quest completion. Each entry:
  RequiredQuestID - Expansion Quest ID to complete
  DesignNames - Array of design names to unlock
  LockedMessage - Message shown when clicking a locked design
  QuestLockOnly - If true, design ONLY unlocks via quest (not discovery). Default: true
    Set to false to allow dual-unlock (quest OR discovery).

--- QuestObjectiveFilters ---
Map Expansion ACTION objective IDs to graffiti-specific conditions.
Each entry has an ObjectiveID (matching the Expansion objective) and an ActionType.

ActionType values:
  spray          - Spray any/specific design
  spray_over     - Paint over existing graffiti
  spray_match    - Spray design matching nearby graffiti (MatchMode: exact/category)
  spray_sequence - Spray designs in specific order (DesignSequence array)
  spray_chain    - Each spray within SprayChainMaxDistance of previous
  spray_spell    - Spray sequence left-to-right on a wall
  mark           - Spray at locations MinSprayDistance apart
  clean          - Clean graffiti (CleanTarget: any/own/others/allies/enemies)
  discover       - Inspect any graffiti
  discover_unique - Discover different designs each time
  discover_player - Discover specific player's graffiti

Common filters (apply to all types):
  DesignName         - Require specific design name
  DesignCategories   - Filter by category: Plants, Phrases, Symbols, Cats, Food
  DesignTags         - Filter by tag: hostile, friendly, directional
  Position/MaxDistance - Location constraint (vector + radius in meters)
  CanType            - Spray can: small/medium/large, glow/noglow, or exact class name (e.g. SprayZ_GraffitiCan_Dusk)
  TimeOfDay          - day or night
  WeatherCondition   - rain or clear
  Exposure           - indoor or outdoor
  MinElevation/MaxElevation - Height constraints
  TerritoryMode      - any, own, enemy, none (requires Expansion BaseBuilding)


=== QUEST SETUP GUIDE ===

Requires DayZ-Expansion-Quests mod. Quest files go in:
  profiles/ExpansionMod/Quests/Quests/Quest_XXX.json
  profiles/ExpansionMod/Quests/Objectives/Action/Objective_A_XXX.json
  profiles/ExpansionMod/Quests/NPCs/QuestNPC_XXX.json

Step 1: Create ACTION objective (Objective_A_XXX.json):
  {
    "ConfigVersion": 28, "ID": 3000, "ObjectiveType": 10,
    "ObjectiveText": "Spray 3 designs near the airfield",
    "TimeLimit": -1, "Active": 1,
    "ActionNames": ["SprayZ_ActionSprayGraffiti"],
    "AllowedClassNames": [], "ExcludedClassNames": [],
    "ExecutionAmount": 3
  }
  ActionNames: SprayZ_ActionSprayGraffiti (spray) or SprayZ_ActionCleanGraffiti (clean)
  ExecutionAmount: how many times the action must be performed

Step 2: Create quest (Quest_XXX.json):
  {
    "ConfigVersion": 22, "ID": 300, "Type": 0,
    "Title": "Street Art Challenge",
    "Descriptions": ["Start text", "Progress text", "Complete text"],
    "ObjectiveText": "Complete the graffiti challenges",
    "FollowUpQuest": -1, "Repeatable": 1,
    "IsDailyQuest": 0, "IsWeeklyQuest": 0,
    "CancelQuestOnPlayerDeath": 0, "Autocomplete": 0, "IsGroupQuest": 0,
    "QuestItems": [],
    "Rewards": [{"ClassName": "SprayZ_GraffitiCan", "Amount": 1,
      "Attachments": [], "DamagePercent": 0, "HealthPercent": 0,
      "QuestID": -1, "Chance": 1.0}],
    "NeedToSelectReward": 0, "RandomReward": 0, "RandomRewardAmount": -1,
    "RewardsForGroupOwnerOnly": 1, "RewardBehavior": 0,
    "QuestGiverIDs": [100], "QuestTurnInIDs": [100],
    "IsAchievement": 0,
    "Objectives": [{"ConfigVersion": 28, "ID": 3000, "ObjectiveType": 10}],
    "QuestColor": 0, "ReputationReward": 0, "ReputationRequirement": -1,
    "PreQuestIDs": [],
    "PlayerNeedQuestItems": 1, "DeleteQuestItems": 1,
    "SequentialObjectives": 1,
    "FactionReputationRequirements": {}, "FactionReputationRewards": {},
    "SuppressQuestLogOnCompetion": 0, "Active": 1
  }
  IMPORTANT: Design-unlock quests MUST have Repeatable: 1
  QuestGiverIDs/QuestTurnInIDs reference NPC IDs from QuestNPC files
  SequentialObjectives: 1 = objectives must complete in order

Step 3: Create NPC (QuestNPC_XXX.json):
  {
    "ConfigVersion": 6, "ID": 100,
    "ClassName": "ExpansionQuestNPCGuo",
    "Position": [4500.0, 340.0, 10200.0],
    "Orientation": [180.0, 0.0, 0.0],
    "NPCName": "Graffiti Dave",
    "DefaultNPCText": "Want the rare tags? Prove yourself.",
    "NPCLoadoutFile": "SurvivorLoadout",
    "NPCInteractionEmoteID": 1, "NPCQuestCancelEmoteID": 60,
    "NPCQuestStartEmoteID": 58, "NPCQuestCompleteEmoteID": 39,
    "NPCType": 0, "Active": 1
  }

Step 4: Add SprayZ filter in SprayZ_Designs.json -> QuestObjectiveFilters:
  {
    "ObjectiveID": 3000,
    "ActionType": "spray",
    "DesignName": "(optional)",
    "Position": [0,0,0], "MaxDistance": 200,
    ... (see ActionType values above for available filters)
  }

Step 5 (optional): Lock designs behind quest in SprayZ_Designs.json -> QuestRequirements:
  {
    "RequiredQuestID": 300,
    "DesignNames": ["Pentagram", "Star"],
    "LockedMessage": "Complete 'Street Art Challenge' to unlock.",
    "QuestLockOnly": true
  }


=== DESIGN LOCKING ===

Three ways to lock designs:

1. Discovery-locked (unlock by inspecting another player's spray):
   Add design name to DiscoveryLockedDesigns array in SprayZ_Designs.json

2. Quest-locked (unlock only by completing quest):
   Add QuestRequirements entry with QuestLockOnly: true (default)

3. Dual-unlock (unlock by quest OR discovery):
   Add QuestRequirements entry with QuestLockOnly: false


=== SPRAY CAN TYPES ===

SprayZ_GraffitiCan          - Standard spray can (size cycles via T while held)
SprayZ_GraffitiCanGlow      - Glow-in-the-dark spray can (size cycles via T while held)
SprayZ_Sponge               - Sponge (cleans graffiti when wet)
Add these class names to your types.xml to spawn them as loot.
