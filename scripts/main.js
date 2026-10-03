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

  const SheetConfig = foundry.applications?.config?.DocumentSheetConfig ?? globalThis.DocumentSheetConfig;

  if (SheetConfig?.registerSheet) {
    SheetConfig.registerSheet(Item, MODULE_ID, NpcSpellbookSheet, {
      types: ["loot"],
      label: "NPC Spellbook Sheet",
      makeDefault: false
    });
  }

  patchItemDirectoryContextMenu();
});

Hooks.once("setup", () => {
  ui.notifications?.info("NPC Spellbook | Sheet registered successfully!");
});

Hooks.on("getItemSheetClass", (item) => {
  if (isSpellbook(item)) {
    return NpcSpellbookSheet;
  }
});

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
        const id = getEntryId(li);
        const item = game.items.get(id);
        return item?.type === "loot" && !isSpellbook(item);
      },
      callback: async (li) => {
        const id = getEntryId(li);
        const item = game.items.get(id);
        if (!item) return;
        await markAsSpellbook(item);
        ui.notifications?.info(`Marked ${item.name} as a spellbook.`);
        new NpcSpellbookSheet({ document: item }).render(true);
      }
    });

    options.push({
      name: "NPC_SPELLBOOK.Actions.RemoveSpellbookFlag",
      icon: '<i class="fas fa-book-dead"></i>',
      condition: (li) => {
        const id = getEntryId(li);
        return isSpellbook(game.items.get(id));
      },
      callback: async (li) => {
        const id = getEntryId(li);
        const item = game.items.get(id);
        if (!item) return;
        await item.unsetFlag(MODULE_ID, "isSpellbook");
        await item.unsetFlag(MODULE_ID, "spells");
        ui.notifications?.info(`Unmarked ${item.name} as a spellbook.`);
      }
    });

    options.push({
      name: "NPC_SPELLBOOK.Actions.OpenSpellbook",
      icon: '<i class="fas fa-book-open"></i>',
      condition: (li) => {
        const id = getEntryId(li);
        return isSpellbook(game.items.get(id));
      },
      callback: (li) => {
        const id = getEntryId(li);
        const item = game.items.get(id);
        if (item) new NpcSpellbookSheet({ document: item }).render(true);
      }
    });

    return options;
  };
}
