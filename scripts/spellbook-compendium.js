import { MODULE_ID, addSpellToSpellbook } from "./data.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export class CompendiumSpellPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.spellbook = options.spellbook;
  }

  static DEFAULT_OPTIONS = {
    id: "compendium-spell-picker",
    classes: ["spell-picker", "dnd5e"],
    position: {
      width: 600,
      height: 700
    },
    window: {
      title: "Add Spells to Spellbook",
      resizable: true
    },
    actions: {
      addSpell: CompendiumSpellPicker._onAddSpell
    }
  };

  static PARTS = {
    picker: {
      template: "modules/npc-spell-book/templates/spellbook-compendium.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const spells = [];

    const packs = game.packs.filter(p => p.metadata.type === "Item");
    for (const pack of packs) {
      const index = await pack.getIndex({ fields: ["system.level", "img"] });
      for (const entry of index) {
        if (entry.type === "spell") {
          spells.push({
            name: entry.name,
            uuid: entry.uuid,
            img: entry.img || "icons/svg/item-bag.svg",
            level: entry.system?.level ?? 0,
            pack: pack.metadata.label
          });
        }
      }
    }

    spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    context.spells = spells;
    return context;
  }

  static async _onAddSpell(event, target) {
    event.preventDefault();
    const uuid = target.dataset.uuid;
    if (!uuid || !this.spellbook) return;

    await addSpellToSpellbook(this.spellbook, uuid);

    if (this.spellbook.sheet) {
      this.spellbook.sheet.render();
    }
  }
}
