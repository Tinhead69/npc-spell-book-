Hooks.once("init", () => {
  console.log("NPC Spellbook | Initialising");

  const ItemDirectoryClass =
    foundry?.applications?.sidebar?.tabs?.ItemDirectory ?? globalThis.ItemDirectory;

  if (!ItemDirectoryClass) {
    console.error("NPC Spellbook | Could not find ItemDirectory class");
    return;
  }

  const originalGetEntryContextOptions = ItemDirectoryClass.prototype._getEntryContextOptions;

  ItemDirectoryClass.prototype._getEntryContextOptions = function () {
    const options = originalGetEntryContextOptions
      ? originalGetEntryContextOptions.call(this)
      : [];

    const getEntryId = (li) =>
      li?.dataset?.entryId ??
      li?.dataset?.documentId ??
      li?.getAttribute?.("data-entry-id") ??
      li?.getAttribute?.("data-document-id") ??
      null;

    options.push({
      name: "Mark as Spellbook",
      icon: '<i class="fas fa-book"></i>',
      condition: (li) => {
        const id = getEntryId(li);
        const item = game.items.get(id);
        console.log("NPC Spellbook | Mark check", { id, item });
        return item?.type === "loot" && !item.getFlag("npc-spell-book", "isSpellbook");
      },
      callback: async (li) => {
        const id = getEntryId(li);
        const item = game.items.get(id);
        if (!item) return;

        await item.setFlag("npc-spell-book", "isSpellbook", true);
        await item.setFlag("npc-spell-book", "spells", []);

        ui.notifications.info(`${item.name} is now a spellbook.`);
      }
    });

    options.push({
      name: "Remove Spellbook Flag",
      icon: '<i class="fas fa-book-slash"></i>',
      condition: (li) => {
        const id = getEntryId(li);
        const item = game.items.get(id);
        console.log("NPC Spellbook | Remove check", { id, item });
        return item?.getFlag("npc-spell-book", "isSpellbook") === true;
      },
      callback: async (li) => {
        const id = getEntryId(li);
        const item = game.items.get(id);
        if (!item) return;

        await item.unsetFlag("npc-spell-book", "isSpellbook");
        await item.unsetFlag("npc-spell-book", "spells");

        ui.notifications.info(`${item.name} is no longer a spellbook.`);
      }
    });

    console.log("NPC Spellbook | Patched item directory context options");
    return options;
  };
});

Hooks.once("ready", () => {
  console.log("NPC Spellbook | Ready");
});

Hooks.on("renderItemDirectory", (app, html) => {
  console.log("NPC Spellbook | renderItemDirectory fired");

  const headerActions = html.find(".directory-header .header-actions");
  if (!headerActions.length) {
    console.warn("NPC Spellbook | Could not find item directory header actions container");
    return;
  }

  if (html.find(".npc-spellbook-create").length) return;

  const button = $(`
    <button type="button" class="npc-spellbook-create">
      <i class="fas fa-book"></i> Create Spellbook
    </button>
  `);

  button.on("click", async (event) => {
    event.preventDefault();

    const item = await Item.create({
      name: "New Spellbook",
      type: "loot",
      img: "icons/sundries/books/book-symbol-moon-gold-blue.webp",
      system: {}
    });

    await item.setFlag("npc-spell-book", "isSpellbook", true);
    await item.setFlag("npc-spell-book", "spells", []);

    ui.notifications.info(`${item.name} created as a spellbook.`);
    item.sheet?.render(true);
  });

  headerActions.append(button);
  console.log("NPC Spellbook | Create Spellbook button added");
});
