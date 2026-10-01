import {
  MODULE_ID,
  SPELLBOOK_ICON,
  getEntryId,
  isSpellbook,
  markAsSpellbook
} from "./data.js";
import { NpcSpellbookSheet } from "./spellbook-sheet.js";

Hooks.once("init", async () => {
  console.log("NPC Spellbook | Initialising V2 Module");

  // Preload Handlebars templates
  await foundry.applications.handlebars.loadTemplates([
    "modules/npc-spell-book/templates/spellbook-sheet.hbs",
    "modules/npc-spell-book/templates/learn-spells.hbs",
    "modules/npc-spell-book/templates/spell-picker.hbs"
  ]);

  // Register the sheet safely using DocumentSheetConfig for Item documents
  DocumentSheetConfig.registerSheet(Item, MODULE_ID, NpcSpellbookSheet, {
    types: ["loot"],
    label: "Study Spell Book Sheet",
    makeDefault: false
  });

  patchItemDirectoryContextMenu();
});

Hooks.once("setup", () => {
  // UI and notifications are fully ready by the setup hook
  ui.notifications.info("NPC Spellbook | Sheet registered successfully!");
});

/** Intercept default sheet opening and swap to NpcSpellbookSheet for spellbook items */
Hooks.on("getItemSheetHeaderButtons", (sheet, buttons) => {
  if (isSpellbook(sheet.document) && !(sheet instanceof NpcSpellbookSheet)) {
    setTimeout(() => {
      new NpcSpellbookSheet({ document: sheet.document }).render(true);
      sheet.close();
    }, 0);
  }
});

/** Context menu items for the Item Directory */
function patchItemDirectoryContextMenu() {
  const ItemDirectoryClass =
    foundry?.applications?.sidebar?.tabs?.ItemDirectory ?? globalThis.ItemDirectory;

  if (!ItemDirectoryClass?.prototype?._getEntryContextOptions) return;

  const original = ItemDirectoryClass.prototype._getEntryContextOptions;

  ItemDirectoryClass.prototype._getEntryContextOptions = function () {
    const options = original.call(this) ?? [];

    options.push({
      name: "NPC_SPELLBOOK.Actions.MarkAsSpellbook",
      icon: '<i class="fas fa-book"></i>',
      condition: (li) => {
        const item = game.items.get(getEntryId(li));
        return item?.type === "loot" && !isSpellbook(item);
      },
      callback: async (li) => {
        const item = game.items.get(getEntryId(li));
        if (!item) return;
        await markAsSpellbook(item);
        ui.notifications.info(`Marked ${item.name} as a spellbook.`);
        new NpcSpellbookSheet({ document: item }).render(true);
      }
    });

    options.push({
      name: "NPC_SPELLBOOK.Actions.RemoveSpellbookFlag",
      icon: '<i class="fas fa-book-dead"></i>',
      condition: (li) => isSpellbook(game.items.get(getEntryId(li))),
      callback: async (li) => {
        const item = game.items.get(getEntryId(li));
        if (!item) return;
        await item.unsetFlag(MODULE_ID, "isSpellbook");
        await item.unsetFlag(MODULE_ID, "spells");
        ui.notifications.info(`Unmarked ${item.name} as a spellbook.`);
      }
    });

    options.push({
      name: "NPC_SPELLBOOK.Actions.OpenSpellbook",
      icon: '<i class="fas fa-book-open"></i>',
      condition: (li) => isSpellbook(game.items.get(getEntryId(li))),
      callback: (li) => {
        const item = game.items.get(getEntryId(li));
        if (item) new NpcSpellbookSheet({ document: item }).render(true);
      }
    });

    return options;
  };
}
