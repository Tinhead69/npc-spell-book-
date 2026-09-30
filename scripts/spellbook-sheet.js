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
      deleteSpell: NpcSpellbookSheet.#onDeleteSpell,
      studySpellbook: NpcSpellbookSheet.#onStudySpellbook
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

  static async #onStudySpellbook(event, target) {
    try {
      const { StudySpellbookDialog } = await import("./learn-dialog.js");
      new StudySpellbookDialog({ spellbook: this.document }).render(true);
    } catch (err) {
      console.error("NPC Spellbook | Failed to open Study Dialog:", err);
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const html = this.element;

    // Delete spell click handler fallback
    html.querySelectorAll(".delete-spell").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        NpcSpellbookSheet.#onDeleteSpell.call(this, e, e.currentTarget);
      });
    });

    // Study spellbook click handler fallback
    html.querySelectorAll(".study-spellbook").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        NpcSpellbookSheet.#onStudySpellbook.call(this, e, e.currentTarget);
      });
    });
  }
}
