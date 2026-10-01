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
  console.log("NPC Spellbook | Initialising");

  game.settings.register(MODULE_ID, "deductGold", {
    name: "NPC_SPELLBOOK.Settings.DeductGold.Name",
    hint: "NPC_SPELLBOOK.Settings.DeductGold.Hint",import {
  MODULE_ID,
  SPELLBOOK_ICON,
  getEntryId,
  isSpellbook,
  markAsSpellbook
} from "./data.js";
import { NpcSpellbookSheet } from "./spellbook-sheet.js";

Hooks.once("init", () => {
  console.log("NPC Spellbook | Initialising V2 Module");

  // Preload templates
  foundry.applications.handlebars.loadTemplates([
    "modules/npc-spell-book/templates/spellbook-sheet.hbs",
    "modules/npc-spell-book/templates/learn-spells.hbs",
    "modules/npc-spell-book/templates/spell-picker.hbs"
  ]);

  // Register sheet class under system scope
  Items.registerSheet("dnd5e", NpcSpellbookSheet, {
    types: ["loot"],
    label: "NPC Spellbook Sheet",
    makeDefault: false
  });
});

/** Hook into sheet rendering to launch NpcSpellbookSheet if the item is a spellbook */
Hooks.on("getItemSheetHeaderButtons", (sheet, buttons) => {
  if (isSpellbook(sheet.document) && !(sheet instanceof NpcSpellbookSheet)) {
    // Prevent default sheet from staying open and replace it with custom ApplicationV2 sheet
    setTimeout(() => {
      new NpcSpellbookSheet({ document: sheet.document }).render(true);
      sheet.close();
    }, 0);
  }
});    scope: "world",
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

  // Preload templates
  foundry.applications.handlebars.loadTemplates([
    "modules/npc-spell-book/templates/spellbook-sheet.hbs",
    "modules/npc-spell-book/templates/learn-spells.hbs",
    "modules/npc-spell-book/templates/spell-picker.hbs"
  ]);

  // Register V2 Sheet Class with DocumentSheetConfig
  Items.registerSheet("dnd5e", NpcSpellbookSheet, {
    types: ["loot"],
    label: "NPC Spellbook Sheet",
    makeDefault: false
  });

  patchItemDirectoryContextMenu();
});

/** Override Item double-click / click to open NpcSpellbookSheet when flagged as spellbook */
Hooks.on("getItemSheetHeaderButtons", (sheet, buttons) => {
  if (isSpellbook(sheet.document) && !(sheet instanceof NpcSpellbookSheet)) {
    // If opened in default sheet, render the spellbook sheet instead and close standard sheet
    setTimeout(() => {
      new NpcSpellbookSheet({ document: sheet.document }).render(true);
      sheet.close();
    }, 10);
  }
});

/** Patch sidebar item context menu */
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

/** Create a flagged NPC spellbook loot item */
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

function resolveAppElement(htmlOrElement) {
  if (!htmlOrElement) return null;
  if (htmlOrElement instanceof HTMLElement) return htmlOrElement;
  if (htmlOrElement[0] instanceof HTMLElement) return htmlOrElement[0];
  if (htmlOrElement.jquery && htmlOrElement[0]) return htmlOrElement[0];
  return null;
}

/** Intercept direct clicks in Item sidebar directory */
Hooks.on("renderItemDirectory", (app, htmlOrElement) => {
  const root = resolveAppElement(htmlOrElement) ?? app?.element;
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

  // Create button header action
  if (root.querySelector(".npc-spellbook-create")) return;
  const header =
    root.querySelector(".directory-header .header-actions") ??
    root.querySelector(".header-actions") ??
    root.querySelector(".directory-header");
  if (!header) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "npc-spellbook-create";
  button.title = "Create Spellbook";
  button.innerHTML = `<i class="fas fa-book"></i>`;
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    await createNpcSpellbook();
  });
  header.append(button);
});
