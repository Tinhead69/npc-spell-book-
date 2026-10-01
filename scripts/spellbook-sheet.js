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

    // 1. Fetch spells from the module flag, with fallbacks for alternative paths
    let rawSpells =
      item.getFlag(MODULE_ID, "spells") ||
      item.flags?.[MODULE_ID]?.spells ||
      item.flags?.["npc-spell-book"]?.spells ||
      item.system?.spells ||
      [];

    // Convert object to array if Foundry converted flag data into key-value pairs
    if (!Array.isArray(rawSpells) && typeof rawSpells === "object") {
      rawSpells = Object.values(rawSpells);
    }

    // 2. Initialize level groups (0 to 9)
    const spellbookLevels = {};
    for (let i = 0; i <= 9; i++) {
      spellbookLevels[i] = {
        level: i,
        label: i === 0 ? "Cantrips" : `LEVEL ${i}`,
        spells: []
      };
    }

    // 3. Process each spell and extract clean display properties
    for (const spell of rawSpells) {
      if (!spell) continue;

      const systemData = spell.system || spell.data || {};
      const lvl = systemData.level ?? spell.level ?? 0;

      // Extract time/activation
      const time = systemData.activation?.type
        ? `${systemData.activation.cost || ""} ${systemData.activation.type}`.trim()
        : "—";

      // Extract range
      const range = systemData.range?.value
        ? `${systemData.range.value} ${systemData.range.units || ""}`.trim()
        : systemData.range?.units || "—";

      // Extract target
      const target = systemData.target?.type || "—";

      // Extract components (e.g., V, S, M)
      const components =
        spell.labels?.components?.vsm ||
        systemData.components?.vsm ||
        "";

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

    // 4. Group into an array containing only levels that have spells
    context.activeLevels = Object.values(spellbookLevels).filter(
      (group) => group.spells.length > 0
    );

    return context;
  }
}
