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
import { isWizard } from "./mechanics.js";
import { NpcSpellbookSheet } from "./spellbook-sheet.js";

Hooks.once("init", () => {
  console.log("NPC Spellbook | Initialising");

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

  foundry.applications.handlebars.loadTemplates([
    "modules/npc-spell-book/templates/spellbook-sheet.hbs",
    "modules/npc-spell-book/templates/learn-spells.hbs",
    "modules/npc-spell-book/templates/transcribed-spells.hbs"
  ]);

  Items.registerSheet(MODULE_ID, NpcSpellbookSheet, {
    types: ["loot"],
    label: "NPC Spellbook",
    makeDefault: false
  });

  patchItemDirectoryContextMenu();
});

Hooks.once("ready", () => {
  console.log("NPC Spellbook | Ready");
});

/** Patch item directory right-click menu. */
function patchItemDirectoryContextMenu() {
  const ItemDirectoryClass =
    foundry?.applications?.sidebar?.tabs?.ItemDirectory ?? globalThis.ItemDirectory;

  if (!ItemDirectoryClass?.prototype?._getEntryContextOptions) {
    console.warn("NPC Spellbook | Could not patch item directory context menu");
    return;
  }

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
      name: "NPC_SPELLBOOK.Actions.StudySpellbook",
      icon: '<i class="fas fa-scroll"></i>',
      condition: (li) => isSpellbook(game.items.get(getEntryId(li))),
      callback: async (li) => {
        const item = game.items.get(getEntryId(li));
        if (!item) return;
        const { StudySpellbookDialog } = await import("./learn-dialog.js");
        new StudySpellbookDialog({ spellbook: item }).render(true);
      }
    });

    return options;
  };
}

/** Inject Spellbook type into Create Item dialog. */
Hooks.on("renderDialog", (app, html) => {
  try {
    const title = app?.title ?? "";
    if (!/Create New Item/i.test(title)) return;
    if (html.find(".npc-spellbook-choice").length) return;

    const submitButton = html.find("button[type='submit'], .dialog-buttons button");
    if (!submitButton.length) return;

    const lootLabel = html
      .find("label")
      .filter((_, el) => /loot/i.test(el.textContent ?? ""))
      .first();

    const spellbookLabel = $(`
      <label class="npc-spellbook-choice">
        <input type="radio" name="type" value="__npc_spellbook__">
        <span class="npc-spellbook-choice-content">
          <img src="${SPELLBOOK_ICON}" alt="Spellbook">
          <span class="npc-spellbook-choice-text">${game.i18n.localize("NPC_SPELLBOOK.Create.SpellbookType")}</span>
        </span>
      </label>
    `);

    if (lootLabel.length) lootLabel.after(spellbookLabel);
    else html.find("form").append(spellbookLabel);

    submitButton.off("click.npcSpellbook").on("click.npcSpellbook", async (event) => {
      if (html.find("input[name='type']:checked").val() !== "__npc_spellbook__") return;
      event.preventDefault();
      event.stopPropagation();

      const item = await Item.create({
        name: "New Spellbook",
        type: "loot",
        img: SPELLBOOK_ICON,
        folder: html.find("[name='folder']").val() || null
      });

      await markAsSpellbook(item);
      ui.notifications.info(game.i18n.format("NPC_SPELLBOOK.Create.Created", { name: item.name }));
      app.close();
      item.sheet?.render(true);
    });
  } catch (err) {
    console.error("NPC Spellbook | Failed to patch create item dialog", err);
  }
});

/** Use NPC spellbook sheet when item is flagged. */
Hooks.on("getItemSheetHeaderButtons", (app, buttons) => {
  if (!isSpellbook(app.item)) return;

  buttons.unshift({
    label: game.i18n.localize("NPC_SPELLBOOK.Actions.StudySpellbook"),
    class: "study-spellbook",
    icon: "fas fa-scroll",
    onclick: async () => {
      const { StudySpellbookDialog } = await import("./learn-dialog.js");
      new StudySpellbookDialog({ spellbook: app.item }).render(true);
    }
  });
});

/** Wizard actors: view independently stored transcribed spells. */
Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
  if (app.actor?.type !== "character" || !isWizard(app.actor)) return;

  buttons.push({
    label: game.i18n.localize("NPC_SPELLBOOK.Actions.ViewTranscribed"),
    class: "view-transcribed-spells",
    icon: "fas fa-book-open",
    onclick: async () => {
      const { TranscribedSpellsDialog } = await import("./learn-dialog.js");
      new TranscribedSpellsDialog({ actor: app.actor }).render(true);
    }
  });
});

/** Allow dropping spells onto spellbook sheet from compendium. */
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
