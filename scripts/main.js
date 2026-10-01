import { getSpellbookSheetClass } from "./spellbook-sheet.js";
import { StudySpellbookApp } from "./study-spellbook.js";
import { CompendiumSpellPicker } from "./spellbook-compendium.js";

Hooks.once("init", () => {
  console.log("NPC Spellbook | Initializing NPC Spellbook Module");

  // Register Module Settings
  game.settings.register("npc-spell-book", "deductGold", {
    name: game.i18n.localize("NPC_SPELLBOOK.Settings.DeductGold.Name"),
    hint: game.i18n.localize("NPC_SPELLBOOK.Settings.DeductGold.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("npc-spell-book", "requireGold", {
    name: game.i18n.localize("NPC_SPELLBOOK.Settings.RequireGold.Name"),
    hint: game.i18n.localize("NPC_SPELLBOOK.Settings.RequireGold.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Register Item Sheet safely after dnd5e system classes are initialized
  const SpellbookSheet = getSpellbookSheetClass();

  Items.registerSheet("dnd5e", SpellbookSheet, {
    types: ["container", "loot"],
    makeDefault: false,
    label: "NPC Spellbook Sheet"
  });
});

Hooks.once("ready", () => {
  console.log("NPC Spellbook | Module Ready");

  // Expose Global Helper API for sheet actions and dialogs
  game.npcSpellbook = {
    /**
     * Open the Study / Learn Spells App for a given spellbook item
     * @param {Item} item - The spellbook item
     */
    openStudyApp: (item) => {
      if (!item) return;
      new StudySpellbookApp({ item }).render(true);
    },

    /**
     * Open the Compendium Spell Picker for a given spellbook item
     * @param {Item} item - The spellbook item
     */
    openCompendiumPicker: (item) => {
      if (!item) return;
      new CompendiumSpellPicker({ item }).render(true);
    },

    /**
     * Add a spell data object to a spellbook item's flags
     * @param {Item} item - Target item
     * @param {Object} spellData - Data object for the spell
     */
    addSpellToBook: async (item, spellData) => {
      if (!item || !spellData) return;

      const spells = item.getFlag("npc-spell-book", "spells") || [];
      
      // Check if already present
      if (spells.some(s => s.id === spellData.id || s.name === spellData.name)) {
        ui.notifications.warn(`"${spellData.name}" is already in this spellbook.`);
        return;
      }

      const updated = [...spells, spellData];
      await item.setFlag("npc-spell-book", "spells", updated);
      
      ui.notifications.info(
        game.i18n.format("NPC_SPELLBOOK.Notifications.SpellAdded", { spell: spellData.name })
      );
    }
  };
});

/**
 * Handle dropping spells directly onto an Item Sheet configured as an NPC Spellbook
 */
Hooks.on("dropItemSheetData", async (item, sheet, data) => {
  // Only process if the target item is using or configured as a spellbook
  const isSpellbook = item.flags?.["npc-spell-book"]?.isSpellbook || sheet.constructor.name === "SpellbookSheet";
  if (!isSpellbook || data.type !== "Item") return;

  const droppedItem = await Item.implementation.fromDropData(data);
  if (!droppedItem || droppedItem.type !== "spell") {
    ui.notifications.warn("Only spell items can be added to a spellbook.");
    return false;
  }

  // Format spell entry object
  const spellData = {
    id: droppedItem.id || foundry.utils.randomID(),
    name: droppedItem.name,
    img: droppedItem.img,
    level: droppedItem.system.level ?? 0,
    components: droppedItem.labels?.components?.vsm || "",
    school: droppedItem.system.school || "",
    uuid: droppedItem.uuid
  };

  await game.npcSpellbook.addSpellToBook(item, spellData);
  sheet.render(false);
  return false; // Prevent standard item dropping workflow
});
