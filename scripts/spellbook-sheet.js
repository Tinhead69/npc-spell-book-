import { MODULE_ID, getSpellbookSpells, removeSpellFromSpellbook } from "./data.js";

const { HandlebarsApplicationMixin, DocumentSheetV2 } = foundry.applications.api;

export class NpcSpellbookSheet extends HandlebarsApplicationMixin(DocumentSheetV2) {
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
      openPicker: NpcSpellbookSheet._onAddSpells,
      transcribeSpells: NpcSpellbookSheet._onTranscribe,
      clearSpellbook: NpcSpellbookSheet._onClearAll,
      removeSpell: NpcSpellbookSheet._onRemoveSpell
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

    // Utilize existing helper from data.js instead of re-parsing flags
    const storedSpells = getSpellbookSpells(item);
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

    context.activeLevels = Object.keys(spellGroups)
      .map(Number)
      .sort((a, b) => a - b)
      .map(lvl => spellGroups[lvl]);

    context.hasSpells = context.activeLevels.length > 0;
    return context;
  }

  _prepareSpellData(spell) {
    const sys = spell.system || {};

    // 1. Activation / Casting Time
    let castTime = "—";
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
      castTime = typeMap[sys.activation.type] || `${val}${sys.activation.type}`;
    }

    // 2. Range
    let rangeStr = "—";
    if (sys.range) {
      if (sys.range.units === "self") rangeStr = "Self";
      else if (sys.range.units === "touch") rangeStr = "Touch";
      else if (sys.range.units === "spec") rangeStr = "Spec";
      else if (sys.range.value) rangeStr = `${sys.range.value} ${sys.range.units || ""}`.trim();
    }

    // 3. Target
    let targetStr = "—";
    if (sys.target?.affects?.count || sys.target?.affects?.type) {
      targetStr = `${sys.target.affects.count || ""} ${sys.target.affects.type || ""}`.trim();
    } else if (sys.target?.template?.size) {
      targetStr = `${sys.target.template.size}ft ${sys.target.template.type || ""}`.trim();
    } else if (sys.target?.type) {
      targetStr = sys.target.type;
    }

    // 4. Components
    const props = Array.isArray(sys.properties)
      ? sys.properties
      : (sys.properties instanceof Set ? Array.from(sys.properties) : []);

    const compList = [];
    if (props.includes("vocal") || sys.components?.vocal) compList.push("V");
    if (props.includes("somatic") || sys.components?.somatic) compList.push("S");
    if (props.includes("material") || sys.components?.material) compList.push("M");
    const componentsStr = compList.join(", ") || "—";

    // 5. Duration
    let durationStr = "—";
    if (sys.duration) {
      if (sys.duration.units === "inst") durationStr = "Inst";
      else if (sys.duration.units === "perm") durationStr = "Perm";
      else if (sys.duration.value) durationStr = `${sys.duration.value} ${sys.duration.units || ""}`.trim();
      else if (sys.duration.units) durationStr = sys.duration.units;
    }

    return {
      uuid: spell.uuid || spell._id || spell.id,
      name: spell.name,
      img: spell.img || "icons/svg/book.svg",
      level: sys.level ?? 0,
      time: castTime,
      range: rangeStr,
      target: targetStr,
      components: componentsStr,
      duration: durationStr
    };
  }

  static async _onAddSpells(event, target) {
    // Compendium picker logic
  }

  static async _onTranscribe(event, target) {
    // Transcription logic
  }

  static async _onClearAll(event, target) {
    await this.document.setFlag(MODULE_ID, "spells", []);
    this.render();
  }

  static async _onRemoveSpell(event, target) {
    const spellUuid = target.dataset.uuid;
    if (!spellUuid) return;
    
    // Use existing module function from data.js
    await removeSpellFromSpellbook(this.document, spellUuid);
    this.render();
  }
}

export function getSpellbookSheetClass() {
  return NpcSpellbookSheet;
}
