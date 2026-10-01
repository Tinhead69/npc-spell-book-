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

      // Handle dnd5e system vs flat property layouts
      const sys = spell.system || spell.data || spell;
      const lvl = sys.level ?? spell.level ?? 0;

      // Format Activation Time
      let time = "—";
      const activation = sys.activation;
      if (activation) {
        if (typeof activation === "string") {
          time = activation;
        } else if (activation.type) {
          const cost = activation.cost ? `${activation.cost} ` : "";
          const typeMap = {
            actionプター: "Action",
            action: "Action",
            bonus: "Bonus Action",
            reaction: "Reaction",
            minute: "Minute",
            hour: "Hour"
          };
          const formattedType = typeMap[activation.type] || activation.type;
          time = `${cost}${formattedType}`;
        }
      }

      // Format Range
      let range = "—";
      const rng = sys.range;
      if (rng) {
        if (typeof rng === "string") {
          range = rng;
        } else if (rng.units === "self") {
          range = "Self";
        } else if (rng.units === "touch") {
          range = "Touch";
        } else if (rng.units === "sight") {
          range = "Sight";
        } else if (rng.value) {
          range = `${rng.value} ${rng.units || ""}`.trim();
        } else if (rng.units) {
          range = rng.units.capitalize();
        }
      }

      // Format Target
      let target = "—";
      const tgt = sys.target;
      if (tgt) {
        if (typeof tgt === "string") {
          target = tgt;
        } else if (tgt.value || tgt.type) {
          const val = tgt.value ? `${tgt.value} ` : "";
          const units = tgt.units ? `${tgt.units} ` : "";
          const type = tgt.type ? `${tgt.type}` : "";
          target = `${val}${units}${type}`.trim() || "—";
        }
      }

      // Format Components
      const comp = sys.components || {};
      let compsList = [];
      if (comp.v) compsList.push("V");
      if (comp.s) compsList.push("S");
      if (comp.m) compsList.push("M");
      const components = compsList.length > 0 ? `(${compsList.join(", ")})` : (spell.labels?.components?.vsm || "");

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
  }
}
