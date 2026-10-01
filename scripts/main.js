import {
  MODULE_ID,
  SPELLBOOK_ICON,
  getEntryId,
  isSpellbook,
  markAsSpellbook,
  addSpellToSpellbook
} from "./data.js";
import { NpcSpellbookSheet } from "./spellbook-sheet.js";

Hooks.once("init", () => {
  console.log("NPC Spellbook | Initialising V2 Module");

  game.settings.register(MODULE_ID, "deductGold", {
    name: "NPC_SPELLBOOK.Settings.DeductGold.Name",
    hint: "NPC_SPELLBOOK.Settings.DeductGold.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "requireGold", {
    name: "NPC_SPELLBOOK.Settings.RequireGold.Name",
    hint: "NPC_SPELLBOOK.Settings.RequireGold.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Load templates using V2 handlebars loader
  foundry.applications.handlebars.loadTemplates([
    "modules/npc-spell-book/templates/spellbook-sheet.hbs",
    "modules/npc-spell-book/templates/learn-spells.hbs",
    "modules/npc-spell-book/templates/spell-picker.hbs"
  ]);

  // Register V2 ItemSheet class
  Items.registerSheet(MODULE_ID, NpcSpellbookSheet, {
    types: ["loot"],
    label: "NPC Spellbook Sheet",
    makeDefault: false
  });

  patchItemDirectoryContextMenu();
});

/** Hook to override sheet opening for items marked as spellbooks */
Hooks.on("getItemSheetHeaderButtons", (sheet, buttons) => {
  // Safe hook check for V2 sheet compatibility
});

/** Direct ApplicationV2 sheet opening override */
Hooks.on("renderItemDirectory", (app, htmlOrElement) => {
  const root = htmlOrElement instanceof HTMLElement ? htmlOrElement : htmlOrElement[0];
  if (!root) return;

  root.querySelectorAll(".directory-item.document, .directory-item").forEach((el) => {
    const docId = el.dataset.documentId || el.dataset.entryId;
    const item = game.items.get(docId);
    
    if (item && isSpellbook(item)) {
      el.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        new NpcSpellbookSheet({ document: item }).render(true);
      }, true);
    }
  });
});

/** Context menu registration */
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
        ui.notifications.info(game.i18n.format("NPC_SPELLBOOK.Notifications.MarkedSpellbook", { name: item.name }));
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
        ui.notifications.info(game.i18n.format("NPC_SPELLBOOK.Notifications.UnmarkedSpellbook", { name: item.name }));
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

/** Helper function to instantiate new V2 Spellbook document */
async function createNpcSpellbook({ folder = null } = {}) {
  const item = await Item.implementation.create({
    name: "New Spellbook",
    type: "loot",
    img: SPELLBOOK_ICON || "icons/svg/book.svg",
    folder,
    flags: {
      "npc-spell-book": {
        isSpellbook: true,
        spells: []
      }
    }
  });

  ui.notifications.info(game.i18n.format("NPC_SPELLBOOK.Create.Created", { name: item.name }));
  new NpcSpellbookSheet({ document: item }).render(true);
  return item;
}
