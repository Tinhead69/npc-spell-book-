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
            action: "Action",
            bonus: "Bonus Action",
            reaction: "Reaction",
            minute: "Minute",
            hour: "Hour",
            day: "Day"
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
          const units = rng.units ? ` ${rng.units}` : "";
          range = `${rng.value}${units}`;
        } else if (rng.units) {
          range = typeof rng.units === "string" ? rng.units.capitalize() : "—";
        }
      }

      // Format Target / Area
      let target = "—";
      const tgt = sys.target;
      const area = sys.area;
      if (tgt && (tgt.value || tgt.type || tgt.units)) {
        const val = tgt.value ? `${tgt.value} ` : "";
        const units = tgt.units ? `${tgt.units} ` : "";
        const type = tgt.type ? `${tgt.type}` : "";
        target = `${val}${units}${type}`.trim();
      } else if (area && (area.value || area.type)) {
        const val = area.value ? `${area.value} ` : "";
        const units = area.units ? `${area.units} ` : "";
        const type = area.type ? `${area.type}` : "";
        target = `${val}${units}${type}`.trim();
      } else if (typeof tgt === "string") {
        target = tgt;
      }

      // Format Components (including material details if available)
      const comp = sys.components || {};
      let compsList = [];
      if (comp.v || (Array.isArray(comp.value) && comp.value.includes("v"))) compsList.push("V");
      if (comp.s || (Array.isArray(comp.value) && comp.value.includes("s"))) compsList.push("S");
      if (comp.m || (Array.isArray(comp.value) && comp.value.includes("m"))) {
        let mStr = "M";
        if (comp.materials?.value) {
          mStr += ` (${comp.materials.value})`;
        }
        compsList.push(mStr);
      }
      
      let components = "";
      if (compsList.length > 0) {
        components = `(${compsList.join(", ")})`;
      } else if (spell.labels?.components?.vsm) {
        components = `(${spell.labels.components.vsm})`;
      }

      const normalizedSpell = {
        _id: spell._id || spell.id || foundry.utils.randomID(),
        name: spell.name || "Unnamed Spell",
        img: spell.img || "icons/svg/book.svg",
        time,
        range,
        target: target || "—",
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

    // Delete Individual Spell listener
    html.find(".spell-delete").click(async (event) => {
      event.preventDefault();
      const row = event.currentTarget.closest(".spell-row");
      const spellId = row?.dataset?.spellId;
      if (!spellId) return;

      let rawSpells =
        this.item.getFlag(MODULE_ID, "spells") ||
        this.item.flags?.[MODULE_ID]?.spells ||
        this.item.flags?.["npc-spell-book"]?.spells ||
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
}
