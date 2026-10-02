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
    
    // Group spells by level (0 to 9, where 0 is cantrips)
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

        // 1. Casting Time (Activation)
        let time = "—";
        const activation = sys.activation;
        if (activation) {
          const cost = activation.value ? `${activation.value} ` : "";
          const typeMap = { 
            action: "Action", 
            bonus: "Bonus", 
            reaction: "Reaction", 
            minute: "Min", 
            hour: "Hour", 
            day: "Day",
            legendary: "Legendary",
            mythic: "Mythic",
            special: "Special"
          };
          const typeLabel = typeMap[activation.type] || activation.type || "";
          if (typeLabel) {
            time = `${cost}${typeLabel}`.trim();
          }
        }

        // 2. Range
        let range = "—";
        const rng = sys.range;
        if (rng) {
          if (rng.units === "self") {
            range = "Self";
          } else if (rng.units === "touch") {
            range = "Touch";
          } else if (rng.units === "sight") {
            range = "Sight";
          } else if (rng.value) {
            const unitMap = { ft: "ft", mi: "mi", m: "m", km: "km" };
            const uLabel = unitMap[rng.units] || rng.units || "";
            range = `${rng.value}${uLabel ? ` ${uLabel}` : ""}`;
          } else if (rng.units) {
            range = rng.units;
          }
        }

        // 3. Target
        let target = "—";
        const tgt = sys.target;
        if (tgt) {
          // Check dnd5e modern affects sub-object structure if present
          const affects = tgt.affects || tgt;
          const count = affects.scalar?.value ?? affects.value ?? "";
          const type = affects.type ?? "";
          const special = affects.special ?? "";

          if (special) {
            target = special;
          } else if (count || type) {
            const countStr = count ? `${count} ` : "";
            // Capitalize / clean up type
            const typeStr = type ? type.replace(/_/g, " ") : "";
            target = `${countStr}${typeStr}`.trim();
          }
          if (!target || target === "") target = "—";
        }

        // 4. Components (derived from sys.properties array like ['vocal', 'somatic'])
        let components = "—";
        const props = sys.properties || [];
        const compParts = [];
        if (props.includes("vocal") || props.includes("v")) compParts.push("V");
        if (props.includes("somatic") || props.includes("s")) compParts.push("S");
        if (props.includes("material") || props.includes("m") || (sys.materials?.value && sys.materials.value.length > 0)) {
          compParts.push("M");
        }
        if (compParts.length > 0) {
          components = compParts.join(", ");
        }

        // 5. Duration
        let duration = "—";
        const dur = sys.duration;
        if (dur) {
          if (dur.units === "instantaneous") {
            duration = "Instant";
          } else if (dur.units === "perm") {
            duration = "Permanent";
          } else if (dur.units === "special") {
            duration = "Special";
          } else if (dur.value || dur.units) {
            const val = dur.value ? `${dur.value} ` : "";
            const unitMap = { turn: "Turn", round: "Round", minute: "Min", hour: "Hour", day: "Day", inst: "Instant" };
            const uLabel = unitMap[dur.units] || dur.units || "";
            duration = `${val}${uLabel}`.trim();
          }
          if (dur.concentration) {
            duration = `C. ${duration}`;
          }
          if (!duration) duration = "—";
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
