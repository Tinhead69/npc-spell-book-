import { MODULE_ID, getSpellbookSpells, removeSpellFromSpellbook } from "./data.js";
import { CompendiumSpellPicker } from "./spellbook-compendium.js";

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NpcSpellbookSheet extends HandlebarsApplicationMixin(DocumentSheetV2) {
  static DEFAULT_OPTIONS = {
    id: "npc-spellbook-sheet-{id}",
    classes: ["npc-spellbook", "dnd5e", "sheet", "item"],
    tag: "window",
    window: {
      contentClasses: ["standard-form"],
      icon: "fas fa-book"
    },
    position: {
      width: 650,
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
    return this.document.name;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;

    context.item = item;
    context.name = item.name;
    context.img = item.img;
    
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

  static async _onAddSpell(event, target) {
    event.preventDefault();
    const sheet = this;
    new CompendiumSpellPicker({ spellbook: sheet.document }).render(true);
  }

  static async _onRemoveSpell(event, target) {
    event.preventDefault();
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    await removeSpellFromSpellbook(this.document, uuid);
    this.render(false);
  }

  static async _onClearBook(event, target) {
    event.preventDefault();
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Clear Spellbook" },
      content: "<p>Are you sure you want to remove all spells from this spellbook?</p>",
      yes: { label: "Clear", icon: "fas fa-trash" },
      no: { label: "Cancel", icon: "fas fa-times" }
    });

    if (confirmed) {
      await this.document.unsetFlag(MODULE_ID, "spells");
      this.render(false);
    }
  }
}
