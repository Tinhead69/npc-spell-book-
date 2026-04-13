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
