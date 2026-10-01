/**
 * NPC Spellbook Item Sheet
 */
export function getSpellbookSheetClass() {
  // Dynamically resolve base class at hook execution time to prevent undefined errors
  const BaseItemSheet = dnd5e?.applications?.item?.ItemSheet5e ?? ItemSheet;

  return class SpellbookSheet extends BaseItemSheet {
    /** @override */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        classes: ["dnd5e", "sheet", "item", "npc-spellbook-sheet"],
        template: "modules/npc-spell-book/templates/spellbook-sheet.hbs",
        width: 520,
        height: 600,
        resizable: true,
        scrollY: [".spells-list"]
      });
    }

    /** @override */
    async getData(options = {}) {
      const context = await super.getData(options);
      const item = this.item;

      // Extract stored spells from flags
      const spells = item.getFlag("npc-spell-book", "spells") || [];
      
      // Group spells by level (0-9)
      const spellLevels = {};
      for (const spell of spells) {
        const lvl = spell.level ?? 0;
        if (!spellLevels[lvl]) spellLevels[lvl] = [];
        spellLevels[lvl].push(spell);
      }

      context.spellLevels = spellLevels;
      context.hasSpells = spells.length > 0;

      return context;
    }

    /** @override */
    activateListeners(html) {
      super.activateListeners(html);

      // Event Listeners for actions
      html.find('[data-action="addSpell"]').on("click", this._onAddSpell.bind(this));
      html.find('[data-action="clearSpellbook"]').on("click", this._onClearSpellbook.bind(this));
      html.find('[data-action="studySpellbook"]').on("click", this._onStudySpellbook.bind(this));
      html.find('[data-action="deleteSpell"]').on("click", this._onDeleteSpell.bind(this));
    }

    async _onAddSpell(event) {
      event.preventDefault();
      // Logic for adding spell / compendium picker
      if (game.npcSpellbook?.openCompendiumPicker) {
        game.npcSpellbook.openCompendiumPicker(this.item);
      }
    }

    async _onClearSpellbook(event) {
      event.preventDefault();
      const confirm = await Dialog.confirm({
        title: game.i18n.localize("NPC_SPELLBOOK.Actions.ClearSpellbook"),
        content: `<p>Are you sure you want to remove all spells from <strong>${this.item.name}</strong>?</p>`
      });

      if (confirm) {
        await this.item.unsetFlag("npc-spell-book", "spells");
        this.render(false);
      }
    }

    async _onStudySpellbook(event) {
      event.preventDefault();
      if (game.npcSpellbook?.openStudyApp) {
        game.npcSpellbook.openStudyApp(this.item);
      }
    }

    async _onDeleteSpell(event) {
      event.preventDefault();
      const spellId = event.currentTarget.dataset.spellId;
      if (!spellId) return;

      const spells = this.item.getFlag("npc-spell-book", "spells") || [];
      const updated = spells.filter(s => s.id !== spellId);

      await this.item.setFlag("npc-spell-book", "spells", updated);
      this.render(false);
    }
  };
}
