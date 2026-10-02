import { MODULE_ID, getSpellbookSpells, removeSpellFromSpellbook } from "./data.js";
import { CompendiumSpellPicker } from "./spellbook-compendium.js";

const { HandlebarsApplicationMixin, DocumentSheetV2 } = foundry.applications.api;

export class NpcSpellbookSheet extends HandlebarsApplicationMixin(DocumentSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["npc-spellbook", "dnd5e", "sheet", "item"],
    tag: "form",
    form: {
      handler: NpcSpellbookSheet._onSubmitForm,
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: {
      title: "Spellbook",
      resizable: true,
      width: 750,
      height: 600
    },
    actions: {
      addSpell: NpcSpellbookSheet._onAddSpell,
      removeSpell: NpcSpellbookSheet._onRemoveSpell,
      clearBook: NpcSpellbookSheet._onClearBook
    }
  };

  static PARTS = {
    sheet: {
      template: "modules/npc-spell-book/templates/spellbook-sheet.hbs"
    }
  };

  get title() {
    return `${this.document.name}`;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;

    context.item = item;
    context.name = item.name;
    context.img = item.img;
    context.system = item.system;
    context.flags = item.flags;
    
    // Group spells by level (0 to 9)
    const rawSpells = getSpellbookSpells(item);
    const levelGroups = {};
    for (let i = 0; i <= 9; i++) {
      levelGroups[i] = {
        level: i,
        label: i === 0 ? "CANTRIPS" : `LEVEL ${i}`,
        spells: []
      };
    }

    for (const spell of rawSpells) {
      const level = Number(spell.system?.level ?? 0);
      if (level >= 0 && level <= 9) {
        const sys = spell.system || {};

        // 1. Activation (A, BA, R, or time)
        let castTime = "—";
        const act = sys.activation;
        if (act && act.type) {
          const actType = act.type.toLowerCase();
          if (actType === "action") {
            castTime = "A";
          } else if (actType === "bonus") {
            castTime = "BA";
          } else if (actType === "reaction") {
            castTime = "R";
          } else {
            const cost = act.value ? `${act.value} ` : "";
            const typeMap = { 
              minute: "Min", hour: "Hour", day: "Day", 
              legendary: "Legendary", mythic: "Mythic", special: "Special"
            };
            const typeLabel = typeMap[actType] || act.type || "";
            if (typeLabel) castTime = `${cost}${typeLabel}`.trim();
          }
        }

        // 2. Range
        let range = "—";
        const rng = sys.range;
        if (rng) {
          if (rng.units === "self") range = "Self";
          else if (rng.units === "touch") range = "Touch";
          else if (rng.units === "sight") range = "Sight";
          else if (rng.value) {
            const unitMap = { ft: "ft", mi: "mi", m: "m", km: "km" };
            range = `${rng.value}${unitMap[rng.units] ? ` ${unitMap[rng.units]}` : ""}`;
          } else if (rng.units) range = rng.units;
        }

        // 3. Target
        let target = "—";
        const tgt = sys.target;
        if (tgt) {
          const affects = tgt.affects || tgt;
          const count = affects.scalar?.value ?? affects.value ?? "";
          const type = affects.type ?? "";
          const special = affects.special ?? "";

          if (special) target = special;
          else if (count || type) {
            const countStr = count ? `${count} ` : "";
            const typeStr = type ? type.replace(/_/g, " ") : "";
            target = `${countStr}${typeStr}`.trim();
          }
          if (!target) target = "—";
        }

        // 4. Components
        let components = "—";
        const props = sys.properties || [];
        const compParts = [];
        if (props.includes("vocal") || props.includes("v")) compParts.push("V");
        if (props.includes("somatic") || props.includes("s")) compParts.push("S");
        if (props.includes("material") || props.includes("m") || (sys.materials?.value && sys.materials.value.length > 0)) {
          compParts.push("M");
        }
        if (compParts.length > 0) components = compParts.join(", ");

        // 5. Duration
        let duration = "—";
        const dur = sys.duration;
        if (dur) {
          if (dur.units === "instantaneous") duration = "Instant";
          else if (dur.units === "perm") duration = "Permanent";
          else if (dur.units === "special") duration = "Special";
          else if (dur.value || dur.units) {
            const val = dur.value ? `${dur.value} ` : "";
            const unitMap = { turn: "Turn", round: "Round", minute: "Min", hour: "Hour", day: "Day", inst: "Instant" };
            duration = `${val}${unitMap[dur.units] || dur.units}`.trim();
          }
          if (dur.concentration) duration = `C. ${duration}`;
          if (!duration) duration = "—";
        }

        levelGroups[level].spells.push({
          ...spell,
          castTime,
          range,
          target,
          components,
          duration
        });
      }
    }

    Object.values(levelGroups).forEach(group => group.spells.sort((a, b) => a.name.localeCompare(b.name)));

    context.activeLevels = Object.values(levelGroups)
      .filter(group => group.spells.length > 0)
      .sort((a, b) => a.level - b.level);

    context.hasSpells = context.activeLevels.length > 0;
    return context;
  }

  // Handle form changes (e.g. updating item name in real time)
  static async _onSubmitForm(event, form, formData) {
    const updateData = formData.object;
    if (updateData.name && updateData.name !== this.document.name) {
      await this.document.update({ name: updateData.name });
    }
  }

  static async _onAddSpell(event, target) {
    event.preventDefault();
    new CompendiumSpellPicker({ spellbook: this.document }).render(true);
  }

  static async _onRemoveSpell(event, target) {
    event.preventDefault();
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    await removeSpellFromSpellbook(this.document, uuid);
    this.render();
  }

  static async _onClearBook(event, target) {
    event.preventDefault();
    const confirmed = await Dialog.confirm({
      title: "Clear Spellbook",
      content: "<p>Are you sure you want to remove all spells from this spellbook?</p>",
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (confirmed) {
      await this.document.unsetFlag(MODULE_ID, "spells");
      this.render();
    }
  }
}
