import { getSpellbookSpells, setSpellbookSpells, addSpellToSpellbook } from "./data.js";
import { StudySpellbookDialog } from "./learn-dialog.js";

const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class NpcSpellbookSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["npc-spellbook", "sheet", "item"],
    position: {
      width: 600,
      height: 650
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

    const spells = getSpellbookSpells(this.document);
    const levels = {};
    for (const spell of spells) {
      const lvl = Number(spell.level ?? 0);
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
      new StudySpellbookDialog({ spellbook: this.document }).render(true);
    } catch (err) {
      console.error("NPC Spellbook | Failed to open Study Dialog:", err);
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const html = this.element;

    // 1. Add Spell Button
    html.querySelectorAll(".add-spell").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const spellPack = game.packs.get("dnd5e.spells") || 
                          game.packs.find((p) => p.metadata.type === "Item" && p.index.some((i) => i.type === "spell"));

        if (spellPack) {
          spellPack.render(true);
          ui.notifications.info("Drag and drop spells from the compendium into this spellbook.");
        } else {
          ui.sidebar.activateTab("compendiums");
          ui.notifications.info("Drag and drop spells into this spellbook.");
        }
      });
    });

    // 2. Delete Spell Buttons
    html.querySelectorAll(".delete-spell").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        NpcSpellbookSheet.#onDeleteSpell.call(this, e, e.currentTarget);
      });
    });

    // 3. Study Spellbook Button
    html.querySelectorAll(".study-spellbook").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        NpcSpellbookSheet.#onStudySpellbook.call(this, e, e.currentTarget);
      });
    });

    // 4. Drag & Drop Event Listeners
    html.addEventListener("dragover", (e) => e.preventDefault());
    html.addEventListener("drop", async (e) => {
      e.preventDefault();
      let data;
      try {
        data = JSON.parse(e.dataTransfer.getData("text/plain"));
      } catch (err) {
        return;
      }

      if (data?.type === "Item") {
        const item = await Item.implementation.fromDropData(data);
        if (item && item.type === "spell") {
          await addSpellToSpellbook(this.document, item);
          this.render(false);
        } else {
          ui.notifications.warn("Only spells can be added to a spellbook.");
        }
      }
    });
  }
}
