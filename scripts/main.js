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

/**
 * Create a flagged NPC spellbook loot item.
 * @param {object} [options]
 * @param {string|null} [options.folder]
 * @returns {Promise<Item>}
 */
async function createNpcSpellbook({ folder = null } = {}) {
  const item = await Item.implementation.create({
    name: "New Spellbook",
    type: "loot",
    img: SPELLBOOK_ICON,
    folder
  });
  await markAsSpellbook(item);
  ui.notifications.info(game.i18n.format("NPC_SPELLBOOK.Create.Created", { name: item.name }));
  item.sheet?.render(true);
  return item;
}

/** Resolve the root element from ApplicationV1/V2 render hooks. */
function resolveAppElement(htmlOrElement) {
  if (!htmlOrElement) return null;
  if (htmlOrElement instanceof HTMLElement) return htmlOrElement;
  if (htmlOrElement[0] instanceof HTMLElement) return htmlOrElement[0];
  if (htmlOrElement.jquery && htmlOrElement[0]) return htmlOrElement[0];
  return null;
}

/**
 * Inject Spellbook into the Create Item type list (v13 ApplicationV2 + legacy Dialog).
 * @param {Application} app
 * @param {HTMLElement|jQuery} htmlOrElement
 */
function injectSpellbookChoice(app, htmlOrElement) {
  try {
    const title = String(app?.title ?? app?.options?.window?.title ?? "");
    const isCreateItem =
      /Create New Item/i.test(title) ||
      (app?.documentName === "Item" && /create/i.test(app?.constructor?.name ?? ""));
    if (!isCreateItem && !app?.element?.querySelector?.('input[name="type"][value="loot"]')) return;

    const root = resolveAppElement(htmlOrElement) ?? app?.element ?? null;
    if (!root || root.querySelector(".npc-spellbook-choice")) return;

    const lootInput =
      root.querySelector('input[name="type"][value="loot"]') ??
      root.querySelector('input[value="loot"]');
    const lootLabel = lootInput?.closest("label") ?? lootInput?.parentElement;
    if (!lootLabel) return;

    const spellbookLabel = document.createElement("label");
    spellbookLabel.className = "npc-spellbook-choice";
    spellbookLabel.innerHTML = `
      <input type="radio" name="type" value="__npc_spellbook__">
      <span class="npc-spellbook-choice-content">
        <img src="${SPELLBOOK_ICON}" alt="Spellbook">
        <span class="npc-spellbook-choice-text">${game.i18n.localize("NPC_SPELLBOOK.Create.SpellbookType")}</span>
      </span>
    `;
    lootLabel.after(spellbookLabel);

    const form = root.querySelector("form") ?? root;
    form.addEventListener(
      "submit",
      async (event) => {
        const selected = form.querySelector('input[name="type"]:checked')?.value;
        if (selected !== "__npc_spellbook__") return;
        event.preventDefault();
        event.stopImmediatePropagation();

        const folder = form.querySelector('[name="folder"]')?.value || null;
        await createNpcSpellbook({ folder });
        app.close();
      },
      true
    );

    // Also catch ApplicationV2 action buttons that don't use form submit.
    root.querySelectorAll('button[type="submit"], button[data-action="create"]').forEach((button) => {
      button.addEventListener(
        "click",
        async (event) => {
          const selected = form.querySelector('input[name="type"]:checked')?.value;
          if (selected !== "__npc_spellbook__") return;
          event.preventDefault();
          event.stopImmediatePropagation();

          const folder = form.querySelector('[name="folder"]')?.value || null;
          await createNpcSpellbook({ folder });
          app.close();
        },
        true
      );
    });
  } catch (err) {
    console.error("NPC Spellbook | Failed to patch create item dialog", err);
  }
}

Hooks.on("renderDialog", (app, html) => injectSpellbookChoice(app, html));
Hooks.on("renderApplicationV2", (app, element) => injectSpellbookChoice(app, element));

/** Add Create Spellbook control on the Items directory header. */
Hooks.on("renderItemDirectory", (app, htmlOrElement) => {
  const root = resolveAppElement(htmlOrElement) ?? app?.element;
  if (!root || root.querySelector(".npc-spellbook-create")) return;

  const header =
    root.querySelector(".directory-header .header-actions") ??
    root.querySelector(".header-actions") ??
    root.querySelector(".directory-header");
  if (!header) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "npc-spellbook-create";
  button.title = game.i18n.localize("NPC_SPELLBOOK.Create.SpellbookType");
  button.innerHTML = `<i class="fas fa-book"></i>`;
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    await createNpcSpellbook();
  });
  header.append(button);
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
