import * as Data from "./data.js";
import { StudySpellbookDialog } from "./learn-dialog.js";
import { CompendiumSpellPicker } from "./spellbook-compendium.js";

const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class NpcSpellbookSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  constructor(options = {}) {
    if (options.item && !options.document) {
      options.document = options.item;
    }
    super(options);
  }

  static DEFAULT_OPTIONS = {
    id: "npc-spellbook-sheet",
    classes: ["npc-spellbook", "sheet", "item"],
    tag: "form",
    window: {
      title: "NPC Spellbook",
      icon: "fas fa-book",
      resizable: true
    },
    position: {
      width: 600,
      height: 650
    },
    actions: {
      deleteSpell: NpcSpellbookSheet._onDeleteSpell,
      studySpellbook: NpcSpellbookSheet._onStudySpellbook,
      openSpellPicker: NpcSpellbookSheet._onOpenSpellPicker
    }
  };

  static PARTS = {
    body: {
      template: "modules/npc-spell-book/templates/spellbook-sheet.hbs"
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;

    context.item = item;
    context.isGM = game.user.isGM;
    
    const spells = Data.getSpellbookSpells(item);
    context.spells = spells;

    // Group spells by level for sheet layout
    const levels = {};
    for (const spell of spells) {
      const lvl = Number(spell.level ?? 0);
      if (!levels[lvl]) levels[lvl] = [];
      levels[lvl].push(spell);
    }
    context.spellLevels = levels;

    return context;
  }

  /** Action Handler: Open Study / Learn Dialog */
  static async _onStudySpellbook(event, target) {
    event.preventDefault();
    if (typeof StudySpellbookDialog !== "undefined") {
      new StudySpellbookDialog({ spellbook: this.document }).render(true);
    } else {
      console.error("NPC Spellbook | StudySpellbookDialog is not defined.");
    }
  }

  /** Action Handler: Open Compendium Picker */
  static async _onOpenSpellPicker(event, target) {
    event.preventDefault();
    if (typeof CompendiumSpellPicker !== "undefined") {
      new CompendiumSpellPicker({ spellbook: this.document }).render(true);
    } else {
      console.error("NPC Spellbook | CompendiumSpellPicker is not defined.");
    }
  }

  /** Action Handler: Remove Spell */
  static async _onDeleteSpell(event, target) {
    event.preventDefault();
    const spellId = target.dataset.spellId;
    let spells = Data.getSpellbookSpells(this.document);
    spells = spells.filter((s) => s.id !== spellId && s.uuid !== spellId);
    await Data.setSpellbookSpells(this.document, spells);
    this.render(false);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    // Manual click fallback for class-based buttons
    html.querySelectorAll(".study-spellbook, .btn-study").forEach((btn) => {
      btn.addEventListener("click", (e) => NpcSpellbookSheet._onStudySpellbook.call(this, e, btn));
    });

    html.querySelectorAll(".add-spell, .btn-add-spell").forEach((btn) => {
      btn.addEventListener("click", (e) => NpcSpellbookSheet._onOpenSpellPicker.call(this, e, btn));
    });

    // Drag & Drop Spells onto sheet
    html.addEventListener("dragover", (e) => e.preventDefault());
    html.addEventListener("drop", async (e) => {
      e.preventDefault();
      try {
        const raw = e.dataTransfer.getData("text/plain");
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data?.type === "Item") {
          const item = await Item.implementation.fromDropData(data);
          if (item && item.type === "spell") {
            await Data.addSpellToSpellbook(this.document, item);
            this.render(false);
          } else {
            ui.notifications.warn("Only spells can be added to a spellbook.");
          }
        }
      } catch (err) {
        console.error("NPC Spellbook | Drag drop error:", err);
      }
    });
  }
}
