const MODULE_ID = "npc-spell-book";
const SPELLBOOK_ICON = "icons/sundries/books/book-symbol-moon-gold-blue.webp";

function isSpellbook(item) {
  return item?.getFlag(MODULE_ID, "isSpellbook") === true;
}

async function markAsSpellbook(item) {
  await item.setFlag(MODULE_ID, "isSpellbook", true);
  await item.setFlag(MODULE_ID, "spells", []);
}

function getEntryId(li) {
  return (
    li?.dataset?.entryId ??
    li?.dataset?.documentId ??
    li?.getAttribute?.("data-entry-id") ??
    li?.getAttribute?.("data-document-id") ??
    li?.data?.("entryId") ??
    li?.data?.("documentId") ??
    li?.attr?.("data-entry-id") ??
    li?.attr?.("data-document-id") ??
    null
  );
}

Hooks.once("init", () => {
  console.log("NPC Spellbook | Initialising");

  const ItemDirectoryClass =
    foundry?.applications?.sidebar?.tabs?.ItemDirectory ?? globalThis.ItemDirectory;

  if (ItemDirectoryClass?.prototype?._getEntryContextOptions) {
    const originalGetEntryContextOptions = ItemDirectoryClass.prototype._getEntryContextOptions;

    ItemDirectoryClass.prototype._getEntryContextOptions = function () {
      const options = originalGetEntryContextOptions.call(this) ?? [];

      options.push({
        name: "Mark as Spellbook",
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
          ui.notifications.info(`${item.name} is now a spellbook.`);
        }
      });

      options.push({
        name: "Remove Spellbook Flag",
        icon: '<i class="fas fa-book-dead"></i>',
        condition: (li) => {
          const id = getEntryId(li);
          const item = game.items.get(id);
          return isSpellbook(item);
        },
        callback: async (li) => {
          const id = getEntryId(li);
          const item = game.items.get(id);
          if (!item) return;

          await item.unsetFlag(MODULE_ID, "isSpellbook");
          await item.unsetFlag(MODULE_ID, "spells");
          ui.notifications.info(`${item.name} is no longer a spellbook.`);
        }
      });

      return options;
    };
  } else {
    console.warn("NPC Spellbook | Could not patch item directory context menu");
  }
});

Hooks.once("ready", () => {
  console.log("NPC Spellbook | Ready");
});

Hooks.on("renderDialog", (app, html) => {
  console.log("NPC Spellbook | renderDialog fired", app, html);
  try {
    console.log("NPC Spellbook | renderDialog fired");

    const typeInputs = html.find("input[name='type']");
    if (!typeInputs.length) return;

    const createButton = html
      .find("button[type='submit'], .dialog-buttons button")
      .filter((_, el) => /create item/i.test(el.textContent ?? ""))
      .first();

    if (!createButton.length) return;
    if (html.find(".npc-spellbook-choice").length) return;

    const lootInput = html.find("input[name='type'][value='loot']").first();
    const lootRow = lootInput.closest("label");

    const spellbookRow = $(`
      <label class="npc-spellbook-choice">
        <span class="npc-spellbook-choice-content">
          <img src="${SPELLBOOK_ICON}" alt="Spellbook">
          <span class="npc-spellbook-choice-text">Spellbook</span>
        </span>
        <input type="radio" name="type" value="__npc_spellbook__">
      </label>
    `);

    if (lootRow.length) {
      lootRow.after(spellbookRow);
    } else {
      typeInputs.last().closest("label").after(spellbookRow);
    }

    createButton.off("click.npcSpellbook").on("click.npcSpellbook", async (event) => {
      const selected = html.find("input[name='type']:checked").val();
      if (selected !== "__npc_spellbook__") return;

      event.preventDefault();
      event.stopPropagation();

      const nameField = html.find("input[name='name']").val() || "New Spellbook";
      const folderValue = html.find("[name='folder']").val() || null;

      const item = await Item.create({
        name: nameField,
        type: "loot",
        img: SPELLBOOK_ICON,
        folder: folderValue
      });

      await markAsSpellbook(item);

      ui.notifications.info(`${item.name} created as a spellbook.`);
      app.close();
      item.sheet?.render(true);
    });

    console.log("NPC Spellbook | Spellbook option injected");
  } catch (err) {
    console.error("NPC Spellbook | Failed to patch create item dialog", err);
  }
});
