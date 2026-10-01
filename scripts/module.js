import { SpellbookItemSheet } from "./spellbook-sheet.js";

Hooks.once("init", () => {
  console.log("NPC Spellbook | Initializing Module...");

  // Register Ruleset Setting
  game.settings.register("npc-spellbook", "rulesetPreference", {
    name: "Spell Ruleset Preference",
    hint: "Choose which spell revisions to display in the NPC Spellbook browser.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "2024": "2024 Rules Only (Modern)",
      "2014": "2014 Rules Only (Legacy)",
      "both": "Allow Both (2014 & 2024)"
    },
    default: "2024"
  });

  // Register Custom Sheet for Item Types
  Items.registerSheet("dnd5e", SpellbookItemSheet, {
    types: ["container", "loot"],
    makeDefault: false,
    label: "NPC Spellbook Sheet"
  });
});

Hooks.once("ready", () => {
  console.log("NPC Spellbook | Ready!");
});
