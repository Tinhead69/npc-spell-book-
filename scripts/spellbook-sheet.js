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
      addSpell: NpcSpellbookSheet.#onAddSpell,
      deleteSpell: NpcSpellbookSheet.#onDeleteSpell,
      studySpellbook: NpcSpellbookSheet.#onStudySpellbook
    },
    dragDrop: [{ dropSelector: ".npc-spellbook-container" }]
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

  static async #onAddSpell(event, target) {
    event.preventDefault();
    
    // Open the dnd5e spells compendium pack or notify the user
    const spellPack = game.packs.get("dnd5e.spells") || 
                      game.packs.find((p) => p.metadata.type === "Item" && p.index.some((i) => i.type === "spell"));

    if (spellPack) {
      spellPack.render(true);
      ui.notifications.info("Drag and drop spells from the compendium directly into this spellbook.");
    } else {
      ui.sidebar.activateTab("compendiums");
      ui.notifications.info("Drag and drop spells into this spellbook.");
    }
  }

  static async #onDeleteSpell(event, target) {
    event.preventDefault();
    const spellId = target.dataset.spellId;
    let spells = getSpellbookSpells(this.document);
    spells = spells.filter((s) => s.id !== spellId && s.uuid !== spellId);
    await setSpellbookSpells(this.document, spells);
    this.render(false);
  }

  static async #onStudySpellbook(event, target) {
    event.preventDefault();
    try {
      new StudySpellbookDialog({ spellbook: this.document }).render(true);
    } catch (err) {
      console.error("NPC Spellbook | Failed to open Study Dialog:", err);
    }
  }

  /** Handle item drag and drop onto the sheet */
  async _onDrop(event) {
    event.preventDefault();
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch (err) {
      return;
    }

    if (data.type === "Item") {
      const item = await Item.implementation.fromDropData(data);
      if (item && item.type === "spell") {
        await addSpellToSpellbook(this.document, item);
        this.render(false);
      } else {
        ui.notifications.warn("Only spells can be added to a spellbook.");
      }
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const html = this.element;

    // Add Spell button listener
    html.querySelectorAll(".add-spell").forEach((btn) => {
      btn.addEventListener("click", (e) => NpcSpellbookSheet.#onAddSpell.call(this, e, e.currentTarget));
    });

    // Delete Spell button listener
    html.querySelectorAll(".delete-spell").forEach((btn) => {
      btn.addEventListener("click", (e) => NpcSpellbookSheet.#onDeleteSpell.call(this, e, e.currentTarget));
    });

    // Study Spellbook button listener
    html.querySelectorAll(".study-spellbook").forEach((btn) => {
      btn.addEventListener("click", (e) => NpcSpellbookSheet.#onStudySpellbook.call(this, e, e.currentTarget));
    });
  }
}
