import { getSpellbookSpells, setSpellbookSpells } from "./data.js";

const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class NpcSpellbookSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["npc-spellbook", "sheet", "item"],
    position: {
      width: 600,
      height: 600
    },
    form: {
      handler: NpcSpellbookSheet.#onSubmitForm,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      deleteSpell: NpcSpellbookSheet.#onDeleteSpell
    }
  };

  static PARTS = {
    body: {
      template: "modules/npc-spell-book/templates/spellbook-sheet.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.document;
    context.isGM = game.user.isGM;

    // Group spells by level
    const spells = getSpellbookSpells(this.document);
    const levels = {};
    for (const spell of spells) {
      const lvl = spell.level ?? 0;
      if (!levels[lvl]) levels[lvl] = [];
      levels[lvl].push(spell);
    }
    context.spellLevels = levels;

    return context;
  }

  static async #onSubmitForm(event, form, formData) {
    await this.document.update(formData.object);
  }

  static async #onDeleteSpell(event, target) {
    const spellId = target.dataset.spellId;
    let spells = getSpellbookSpells(this.document);
    spells = spells.filter((s) => s.id !== spellId && s.uuid !== spellId);
    await setSpellbookSpells(this.document, spells);
    this.render(false);
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Fallback click handler for delete icons
    const html = this.element;
    html.querySelectorAll(".delete-spell").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        NpcSpellbookSheet.#onDeleteSpell.call(this, e, e.currentTarget);
      });
    });
  }
}
