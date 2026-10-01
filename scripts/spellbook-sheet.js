import { MODULE_ID } from "./data.js";

export class NpcSpellbookSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "npc-spellbook-sheet",
      classes: ["dnd5e", "sheet", "item", "npc-spellbook-sheet"],
      template: "modules/npc-spell-book/templates/spellbook-sheet.hbs",
      width: 620,
      height: 680,
      resizable: true
    });
  }

  async getData(options) {
    const context = await super.getData(options);
    const item = this.item;

    let rawSpells =
      item.getFlag(MODULE_ID, "spells") ||
      item.flags?.[MODULE_ID]?.spells ||
      item.flags?.["npc-spell-book"]?.spells ||
      item.system?.spells ||
      [];

    if (!Array.isArray(rawSpells) && typeof rawSpells === "object") {
      rawSpells = Object.values(rawSpells);
    }

    const spellbookLevels = {};
    for (let i = 0; i <= 9; i++) {
      spellbookLevels[i] = {
        level: i,
        label: i === 0 ? "Cantrips" : `LEVEL ${i}`,
        spells: []
      };
    }

    for (const spell of rawSpells) {
      if (!spell) continue;

      const sys = spell.system || spell.data || spell;
      const labels = spell.labels || sys.labels || {};
      const lvl = sys.level ?? spell.level ?? 0;

      let time = labels.activation || "—";
      let range = labels.range || "—";
      let target = labels.target || "—";
      let components = labels.components?.vsm ? `(${labels.components.vsm})` : "";

      const normalizedSpell = {
        _id: spell._id || spell.id || foundry.utils.randomID(),
        name: spell.name || "Unnamed Spell",
        img: spell.img || "icons/svg/book.svg",
        time,
        range,
        target,
        components
      };

      if (spellbookLevels[lvl]) {
        spellbookLevels[lvl].spells.push(normalizedSpell);
      }
    }

    context.activeLevels = Object.values(spellbookLevels).filter(
      (group) => group.spells.length > 0
    );

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Add Spell button listener - Opens the Spell compendium directory or pack
    html.find(".add-spell-btn, button:has(.fa-plus), button:contains('Add Spell')").click(async (event) => {
      event.preventDefault();
      
      // Find the dnd5e spells compendium or general item compendium pack
      const pack = game.packs.find(p => p.documentName === "Item" && (p.metadata.id.includes("spell") || p.metadata.name.includes("spell")));
      if (pack) {
        pack.render(true);
      } else {
        // Fallback: Open the compendium tab sidebar
        ui.sidebar.activateTab("compendium");
      }
    });

    // Clear Spellbook button listener
    html.find(".clear-spellbook-btn").click(async (event) => {
      event.preventDefault();
      const confirmed = await Dialog.confirm({
        title: "Clear Spellbook",
        content: "<p>Are you sure you want to remove all spells from this spellbook?</p>"
      });
      if (confirmed) {
        await this.item.unsetFlag(MODULE_ID, "spells");
        await this.item.update({ "system.spells": [] });
        this.render();
      }
    });

    // Delete Individual Spell listener
    html.find(".spell-delete").click(async (event) => {
      event.preventDefault();
      const row = event.currentTarget.closest(".spell-row");
      const spellId = row?.dataset?.spellId;
      if (!spellId) return;

      let rawSpells =
        this.item.getFlag(MODULE_ID, "spells") ||
        this.item.flags?.[MODULE_ID]?.spells ||
        item.flags?.["npc-spell-book"]?.spells ||
        this.item.system?.spells ||
        [];

      if (!Array.isArray(rawSpells) && typeof rawSpells === "object") {
        rawSpells = Object.values(rawSpells);
      }

      const updatedSpells = rawSpells.filter(s => {
        const id = s._id || s.id;
        return id !== spellId;
      });

      await this.item.setFlag(MODULE_ID, "spells", updatedSpells);
      await this.item.update({ "system.spells": updatedSpells });
      this.render();
    });
  }

  // Handle dropping spells directly onto the sheet
  async _onDrop(event) {
    event.preventDefault();
    const data = TextEditor.getDragEventData(event);
    if (data.type !== "Item") return;

    const droppedItem = await Item.fromDropData(data);
    if (!droppedItem || droppedItem.type !== "spell") return;

    let rawSpells =
      this.item.getFlag(MODULE_ID, "spells") ||
      this.item.flags?.[MODULE_ID]?.spells ||
      this.item.system?.spells ||
      [];

    if (!Array.isArray(rawSpells)) {
      rawSpells = Object.values(rawSpells);
    }

    // Prevent duplicates based on name or ID
    if (rawSpells.some(s => s.name === droppedItem.name)) return;

    const spellData = {
      _id: droppedItem.id,
      name: droppedItem.name,
      img: droppedItem.img,
      system: droppedItem.system,
      labels: droppedItem.labels,
      level: droppedItem.system?.level || 0
    };

    rawSpells.push(spellData);

    await this.item.setFlag(MODULE_ID, "spells", rawSpells);
    await this.item.update({ "system.spells": rawSpells });
    this.render();
  }
}
