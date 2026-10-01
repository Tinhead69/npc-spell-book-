import { MODULE_ID, getSpellbookSpells, removeSpellFromSpellbook } from "./data.js";
import { CompendiumSpellPicker } from "./spellbook-compendium.js";

const ApplicationV1 = foundry.appv1?.sheets?.ItemSheet || ItemSheet;

export class NpcSpellbookSheet extends ApplicationV1 {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["npc-spellbook", "dnd5e", "sheet", "item"],
      template: "modules/npc-spell-book/templates/spellbook-sheet.hbs",
      width: 750,
      height: 600,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "spells" }]
    });
  }

  get title() {
    return `${this.object.name}`;
  }

  async getData(options) {
    const context = await super.getData(options);
    const item = this.object;

    context.item = item;
    context.system = item.system;
    context.flags = item.flags;
    
    // Group spells by level (1 to 9)
    const rawSpells = getSpellbookSpells(item);
    const levelGroups = {};
    for (let i = 1; i <= 9; i++) {
      levelGroups[i] = {
        level: i,
        label: `LEVEL ${i}`,
        spells: []
      };
    }

    for (const spell of rawSpells) {
      const level = Number(spell.system?.level ?? 1);
      if (level >= 1 && level <= 9) {
        const sys = spell.system || {};

        let time = "—";
        const activation = sys.activation;
        if (typeof activation === "string") {
          time = activation;
        } else if (activation?.type) {
          const cost = activation.cost ? `${activation.cost} ` : "";
          const typeMap = { action: "Action", bonus: "Bonus Action", reaction: "Reaction", minute: "Minute", hour: "Hour", day: "Day" };
          time = `${cost}${typeMap[activation.type] || activation.type}`;
        }

        let range = "—";
        const rng = sys.range;
        if (typeof rng === "string") {
          range = rng;
        } else if (rng?.units === "self") {
          range = "Self";
        } else if (rng?.units === "touch") {
          range = "Touch";
        } else if (rng?.value) {
          range = `${rng.value}${rng.units ? ` ${rng.units}` : ""}`;
        } else if (rng?.units) {
          range = rng.units;
        }

        let target = "—";
        const tgt = sys.target;
        if (typeof tgt === "string") {
          target = tgt;
        } else if (tgt?.value || tgt?.type) {
          const val = tgt.value ? `${tgt.value} ` : "";
          const units = tgt.units ? `${tgt.units} ` : "";
          const type = tgt.type ? `${tgt.type}` : "";
          target = `${val}${units}${type}`.trim();
          if (!target) target = "—";
        }

        let components = "—";
        const comps = sys.components;
        if (comps) {
          const parts = [];
          if (comps.v) parts.push("V");
          if (comps.s) parts.push("S");
          if (comps.m) parts.push("M");
          components = parts.join(", ") || "—";
        }

        let duration = "—";
        const dur = sys.duration;
        if (typeof dur === "string") {
          duration = dur;
        } else if (dur?.units === "instantaneous") {
          duration = "Instant";
        } else if (dur?.units === "perm") {
          duration = "Permanent";
        } else if (dur?.units === "special") {
          duration = "Special";
        } else if (dur?.value) {
          const unitMap = { turn: "Turn", round: "Round", minute: "Min", hour: "Hour", day: "Day" };
          const uLabel = unitMap[dur.units] || dur.units;
          duration = `${dur.value} ${uLabel}`;
        } else if (dur?.units) {
          duration = dur.units;
        }

        levelGroups[level].spells.push({
          ...spell,
          time,
          range,
          target,
          components,
          duration
        });
      }
    }

    Object.values(levelGroups).forEach(group => {
      group.spells.sort((a, b) => a.name.localeCompare(b.name));
    });

    context.activeLevels = Object.values(levelGroups)
      .filter(group => group.spells.length > 0)
      .sort((a, b) => a.level - b.level);

    context.hasSpells = context.activeLevels.length > 0;
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    html.find(".add-spell-btn").click(async (ev) => {
      ev.preventDefault();
      new CompendiumSpellPicker({ spellbook: this.object }).render(true);
    });

    html.find(".remove-spell-btn").click(async (ev) => {
      ev.preventDefault();
      const uuid = ev.currentTarget.dataset.uuid;
      if (!uuid) return;
      await removeSpellFromSpellbook(this.object, uuid);
      this.render(false);
    });

    html.find(".clear-book-btn").click(async (ev) => {
      ev.preventDefault();
      const confirmed = await Dialog.confirm({
        title: "Clear Spellbook",
        content: "<p>Are you sure you want to remove all spells from this spellbook?</p>",
        yes: () => true,
        no: () => false,
        defaultYes: false
      });

      if (confirmed) {
        await this.object.unsetFlag(MODULE_ID, "spells");
        this.render(false);
      }
    });
  }
}
