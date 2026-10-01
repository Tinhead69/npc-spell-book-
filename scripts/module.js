import { SpellbookItemSheet } from "./spellbook-sheet.js";

// Register custom world settings and sheets on Foundry initialization
Hooks.once("init", () => {
  console.log("NPC Spellbook | Initializing NPC Spellbook Module");

  // 1. Register Ruleset Setting (2014 vs 2024 vs Both)
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
    default: "2024",
    onChange: () => {
      // Re-render open spellbook windows if setting changes
      ui.windows && Object.values(ui.windows).forEach(w => {
        if (w.constructor.name === "CompendiumPickerDialog") w.render();
      });
    }
  });

  // 2. Register Custom Sheet for Container & Loot Items
  Items.registerSheet("dnd5e", SpellbookItemSheet, {
    types: ["container", "loot"],
    makeDefault: false,
    label: "NPC Spellbook Sheet"
  });
});

Hooks.once("ready", () => {
  console.log("NPC Spellbook | Ready!");
});
