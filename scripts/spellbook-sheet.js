import { MODULE_ID } from "./data.js";

const { HandlebarsApplicationMixin, ItemSheetV2 } = foundry.applications.api;

export class NpcSpellbookSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    id: "npc-spellbook-sheet",
    classes: ["dnd5e2", "sheet", "item", "spellbook-sheet"],
    tag: "form",
    window: {
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 680,
      height: 600
    },
    actions: {
      addSpells: NpcSpellbookSheet._onAddSpells,
      transcribe: NpcSpellbookSheet._onTranscribe,
      clearAll: NpcSpellbookSheet._onClearAll,
      deleteSpell: NpcSpellbookSheet._onDeleteSpell
    }
  };

  static PARTS = {
    form: {
      template: "modules/npc-spell-book/templates/spellbook-sheet.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;

    context.item = item;
    context.isEditable = this.isEditable;

    const storedSpells = item.getFlag(MODULE_ID, "spells") || [];
    const spellGroups = {};

    for (const rawSpell of storedSpells) {
      const prepared = this._prepareSpellData(rawSpell);
      const lvl = prepared.level;

      if (!spellGroups[lvl]) {
        spellGroups[lvl] = {
          level: lvl,
          label: lvl === 0 ? "CANTRIPS" : `LEVEL ${lvl}`,
          spells: []
        };
      }
      spellGroups[lvl].spells.push(prepared);
    }

    context.spellGroups = Object.keys(spellGroups)
      .map(Number)
      .sort((a, b) => a - b)
      .map(lvl => spellGroups[lvl]);

    context.hasSpells = context.spellGroups.length > 0;
    return context;
  }

  _prepareSpellData(spell) {
    const sys = spell.system || {};

    // 1. Casting Time / Activation
    let time = "";
    if (sys.activation?.type) {
      const val = sys.activation.value ? `${sys.activation.value} ` : "";
      const typeMap = {
        action: "1 Act",
        bonus: "1 B.Act",
        reaction: "1 React",
        minute: "Min",
        hour: "Hr",
        day: "Day",
        special: "Spec"
      };
      time = typeMap[sys.activation.type] || `${val}${sys.activation.type}`;
    }

    // 2. Range
    let range = "";
    if (sys.range) {
      if (sys.range.units === "self") range = "Self";
      else if (sys.range.units === "touch") range = "Touch";
      else if (sys.range.units === "spec") range = "Spec";
      else if (sys.range.value) range = `${sys.range.value} ${sys.range.units || ""}`.trim();
    }

    // 3. Target
    let target = "";
    if (sys.target?.affects?.count || sys.target?.affects?.type) {
      target = `${sys.target.affects.count || ""} ${sys.target.affects.type || ""}`.trim();
    } else if (sys.target?.template?.size) {
      target = `${sys.target.template.size}ft ${sys.target.template.type || ""}`.trim();
    } else if (sys.target?.type) {
      target = sys.target.type;
    }

    // 4. Components (V, S, M)
    const props = Array.isArray(sys.properties)
      ? sys.properties
      : (sys.properties instanceof Set ? Array.from(sys.properties) : []);

    const cArray = [];
    if (props.includes("vocal") || sys.components?.vocal) cArray.push("V");
    if (props.includes("somatic") || sys.components?.somatic) cArray.push("S");
    if (props.includes("material") || sys.components?.material) cArray.push("M");
    const components = cArray.join(", ");

    // 5. Duration
    let duration = "";
    if (sys.duration) {
      if (sys.duration.units === "inst") duration = "Inst";
      else if (sys.duration.units === "perm") duration = "Perm";
      else if (sys.duration.value) duration = `${sys.duration.value} ${sys.duration.units || ""}`.trim();
      else duration = sys.duration.units || "";
    }

    return {
      id: spell._id || spell.id,
      name: spell.name,
      img: spell.img || "icons/svg/book.svg",
      level: sys.level ?? 0,
      time: time || "—",
      range: range || "—",
      target: target || "—",
      components: components || "—",
      duration: duration || "—"
    };
  }

  static async _onAddSpells(event, target) {
    // Triggers compendium picker dialog
  }

  static async _onTranscribe(event, target) {
    // Transcribe to actor logic
  }

  static async _onClearAll(event, target) {
    await this.document.setFlag(MODULE_ID, "spells", []);
    this.render();
  }

  static async _onDeleteSpell(event, target) {
    const spellId = target.dataset.spellId;
    const spells = this.document.getFlag(MODULE_ID, "spells") || [];
    const updated = spells.filter(s => (s._id || s.id) !== spellId);
    await this.document.setFlag(MODULE_ID, "spells", updated);
    this.render();
  }
}
