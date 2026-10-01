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
    "modules/npc-spell-book/templates/learn-spells.hbs",
    "modules/npc-spell-book/templates/compendium-picker.hbs"
  ]);

  Items.registerSheet("dnd5e", SpellbookItemSheet, {
    types: ["loot", "container"],
    label: "NPC Spellbook",
    makeDefault: false
  });

  patchItemDirectoryContextMenu();
});

Hooks.once("ready", () => {
  console.log("NPC Spellbook | Ready");
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

/** Create a flagged NPC spellbook loot item. */
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
  item.sheet.render(true);
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

/** Inject Spellbook choice in item creation dialog. */
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
      <span class="npc-spellbook-choice-content">
        <img src="${SPELLBOOK_ICON || 'icons/svg/book.svg'}" alt="Spellbook" class="icon">
        <span class="npc-spellbook-choice-text">${game.i18n.localize("NPC_SPELLBOOK.Create.SpellbookType")}</span>
      </span>
      <input type="radio" name="type" value="__npc_spellbook__">
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

/** Override default sheet rendering for spellbook items on double click */
Hooks.on("renderItemDirectory", (app, html) => {
  const root = resolveAppElement(html) ?? app?.element;
  if (!root) return;

  root.querySelectorAll(".directory-item.document").forEach((el) => {
    const documentId = el.dataset.documentId || el.dataset.entryId;
    const item = game.items.get(documentId);
    if (item && isSpellbook(item)) {
      el.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.sheet.render(true);
      }, true);
    }
  });
});

/** Header button for standard item sheets */
Hooks.on("getItemSheetHeaderButtons", (app, buttons) => {
  if (!isSpellbook(app.item)) return;
  buttons.unshift({
    label: game.i18n.localize("NPC_SPELLBOOK.Actions.StudySpellbook"),
    class: "study-spellbook",
    icon: "fas fa-scroll",
    onclick: () => openStudySpellbook(app.item)
  });
});

/** Header controls for ApplicationV2 sheets */
Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
  const doc = app.document ?? app.actor ?? app.item;
  if (!doc) return;

  if (doc.documentName === "Item" && isSpellbook(doc)) {
    controls.push({
      action: "npc-spellbook-study",
      icon: "fas fa-scroll",
      label: "NPC_SPELLBOOK.Actions.StudySpellbook",
      onClick: () => openStudySpellbook(doc)
    });
  }
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