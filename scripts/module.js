import {
  MODULE_ID,
  SPELLBOOK_ICON,
  getEntryId,
  isSpellbook,
  markAsSpellbook,
  spellItemToEntry,
  getSpellbookSpells,
  setSpellbookSpells
} from "./data.js";
import { SpellbookItemSheet } from "./spellbook-sheet.js";

Hooks.once("init", () => {
  console.log("NPC Spellbook | Initializing Module...");

  // Register Gold & Ruleset Settings under the proper MODULE_ID ("npc-spell-book")
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

  game.settings.register(MODULE_ID, "rulesetPreference", {
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

  foundry.applications.handlebars.loadTemplates([
    "modules/npc-spell-book/templates/spellbook-sheet.hbs",
    "modules/npc-spell-book/templates/compendium-picker.hbs"
  ]);

  // Register Custom Sheet under system "dnd5e"
  Items.registerSheet("dnd5e", SpellbookItemSheet, {
    types: ["container", "loot"],
    makeDefault: false,
    label: "NPC Spellbook Sheet"
  });

  patchItemDirectoryContextMenu();
});

Hooks.once("ready", () => {
  console.log("NPC Spellbook | Ready!");
});

/** Open study dialog for a spellbook item. */
async function openStudySpellbook(item) {
  try {
    const { StudySpellbookDialog } = await import("./learn-dialog.js");
    new StudySpellbookDialog({ spellbook: item }).render(true);
  } catch (err) {
    console.error("NPC Spellbook | Failed to load StudySpellbookDialog:", err);
  }
}

/** Patch item directory context menu safely. */
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
        return (item?.type === "loot" || item?.type === "container") && !isSpellbook(item);
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
      name: "NPC_SPELLBOOK.Actions.StudySpellbook",
      icon: '<i class="fas fa-scroll"></i>',
      condition: (li) => isSpellbook(game.items.get(getEntryId(li))),
      callback: async (li) => {
        const item = game.items.get(getEntryId(li));
        if (!item) return;
        await openStudySpellbook(item);
      }
    });

    return options;
  };
}

/** Allow dropping spells onto spellbook sheet from compendiums. */
Hooks.on("dropItemSheetData", (item, sheet, data) => {
  if (!isSpellbook(item) || data.type !== "Item") return false;
  const dropped = data.data ?? data;
  if (dropped.type !== "spell") return false;

  (async () => {
    let spellDoc = dropped;
    if (data.uuid) {
      const resolved = await fromUuid(data.uuid);
      if (resolved?.documentName === "Item") spellDoc = resolved;
    }
    const entry = spellItemToEntry(spellDoc);
    const spells = getSpellbookSpells(item);
    if (spells.some((s) => s.uuid === entry.uuid)) return;
    spells.push(entry);
    await setSpellbookSpells(item, spells);
    ui.notifications.info(game.i18n.format("NPC_SPELLBOOK.Notifications.SpellAdded", { spell: entry.name }));
    sheet.render(false);
  })();

  return false;
});
