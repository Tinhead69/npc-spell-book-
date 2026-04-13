Hooks.once("init", () => {
  console.log("NPC Spellbook | Initialising");
});

Hooks.once("ready", () => {
  console.log("NPC Spellbook | Ready");
});

function getEntryId(li) {
  return (
    li?.data?.("entryId") ??
    li?.data?.("documentId") ??
    li?.attr?.("data-entry-id") ??
    li?.attr?.("data-document-id") ??
    li?.[0]?.dataset?.entryId ??
    li?.[0]?.dataset?.documentId ??
    null
  );
}

Hooks.on("getItemDirectoryEntryContext", (html, menuItems) => {
  console.log("NPC Spellbook | Context hook fired");

  menuItems.push({
    name: "Mark as Spellbook",
    icon: '<i class="fas fa-book"></i>',
    condition: li => {
      const id = getEntryId(li);
      const item = game.items.get(id);
      console.log("NPC Spellbook | Mark check", { id, item });
      return item?.type === "loot" && !item.getFlag("npc-spell-book", "isSpellbook");
    },
    callback: async li => {
      const id = getEntryId(li);
      const item = game.items.get(id);
      if (!item) return;

      await item.setFlag("npc-spell-book", "isSpellbook", true);
      await item.setFlag("npc-spell-book", "spells", []);

      ui.notifications.info(`${item.name} is now a spellbook.`);
    }
  });

  menuItems.push({
    name: "Remove Spellbook Flag",
    icon: '<i class="fas fa-book-dead"></i>',
    condition: li => {
      const id = getEntryId(li);
      const item = game.items.get(id);
      console.log("NPC Spellbook | Remove check", { id, item });
      return item?.getFlag("npc-spell-book", "isSpellbook") === true;
    },
    callback: async li => {
      const id = getEntryId(li);
      const item = game.items.get(id);
      if (!item) return;

      await item.unsetFlag("npc-spell-book", "isSpellbook");
      await item.unsetFlag("npc-spell-book", "spells");

      ui.notifications.info(`${item.name} is no longer a spellbook.`);
    }
  });
});
