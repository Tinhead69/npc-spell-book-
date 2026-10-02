import { MODULE_ID, getSpellbookSpells, removeSpellFromSpellbook } from "./data.js";
import { CompendiumSpellPicker } from "./spellbook-compendium.js";
import { openTranscribeDialog } from "./mechanics.js";

const { HandlebarsApplicationMixin, DocumentSheetV2 } = foundry.applications.api;

export class NpcSpellbookSheet extends HandlebarsApplicationMixin(DocumentSheetV2) {
  static DEFAULT_OPTIONS = {
    id: "npc-spellbook-sheet",
    classes: ["npc-spellbook-sheet"],
    position: {
      width: 550,
      height: 600
    },
    window: {
      title: "NPC Spellbook",
      resizable: true
    },
    actions: {
      openPicker: NpcSpellbookSheet._onOpenPicker,
      transcribeSpells: NpcSpellbookSheet._onTranscribeSpells,
      clearSpellbook: NpcSpellbookSheet._onClearSpellbook,
      removeSpell: NpcSpellbookSheet._onRemoveSpell
    }
  };

  static PARTS = {
    sheet: {
      template: "modules/npc-spell-book/templates/spellbook-sheet.hbs"
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const rawSpells = getSpellbookSpells(item);

    const levelMap = {};
    for (let i = 0; i <= 9; i++) {
      levelMap[i] = {
        label: i === 0 ? "CANTRIPS" : `LEVEL ${i}`,
        level: i,
        spells: []
      };
    }

    for (const spell of rawSpells) {
      const lvl = Number(spell.system?.level ?? spell.level ?? 0);
      if (levelMap[lvl]) {
        levelMap[lvl].spells.push(spell);
      } else {
        levelMap[0].spells.push(spell);
      }
    }

    context.activeLevels = Object.values(levelMap)
      .filter((g) => g.spells.length > 0)
      .sort((a, b) => a.level - b.level);

    context.hasSpells = context.activeLevels.length > 0;
    context.item = item;

    return context;
  }

  /**
   * Action handler: Open Compendium Spell Picker
   */
  static async _onOpenPicker(event, target) {
    event.preventDefault();
    new CompendiumSpellPicker({ spellbook: this.document }).render(true);
  }

  /**
   * Action handler: Open Transcribe Dialog
   */
  static async _onTranscribeSpells(event, target) {
    event.preventDefault();
    openTranscribeDialog(this.document);
  }

  /**
   * Action handler: Clear all spells from spellbook
   */
  static async _onClearSpellbook(event, target) {
    event.preventDefault();
    
    const confirm = await Dialog.confirm({
      title: "Clear Spellbook",
      content: "<p>Are you sure you want to remove all spells from this spellbook?</p>",
      defaultYes: false
    });

    if (confirm) {
      await this.document.unsetFlag(MODULE_ID, "spells");
      this.render();
    }
  }

  /**
   * Action handler: Remove a single spell
   */
  static async _onRemoveSpell(event, target) {
    event.preventDefault();
    const uuid = target.dataset.uuid;

    if (uuid) {
      await removeSpellFromSpellbook(this.document, uuid);
      this.render();
    }
  }
}
