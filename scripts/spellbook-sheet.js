import { MODULE_ID, getSpellbookSpells, removeSpellFromSpellbook } from "./data.js";
import { CompendiumSpellPicker } from "./spellbook-compendium.js";

export class NpcSpellbookSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["npc-spellbook", "dnd5e", "sheet", "item"],
      template: "modules/npc-spell-book/templates/spellbook-sheet.hbs",
      width: 650,
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
        levelGroups[level].spells.push(spell);
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
