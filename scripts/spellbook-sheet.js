import * as Data from "./data.js";

const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class NpcSpellbookSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  constructor(options = {}) {
    // Handle both { document: item } and legacy { item: item }
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
      width: 550,
      height: 600
    },
    actions: {
      deleteSpell: NpcSpellbookSheet._onDeleteSpell
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
    context.spells = Data.getSpellbookSpells(item);

    // Group spells by level
    const levels = {};
    for (const spell of context.spells) {
      const lvl = Number(spell.level ?? 0);
      if (!levels[lvl]) levels[lvl] = [];
      levels[lvl].push(spell);
    }
    context.spellLevels = levels;

    return context;
  }

  static async _onDeleteSpell(event, target) {
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

    // Support Drag and Drop spells onto the sheet
    html.addEventListener("dragover", (e) => e.preventDefault());
    html.addEventListener("drop", async (e) => {
      e.preventDefault();
      try {
        const data = JSON.parse(e.dataTransfer.getData("text/plain"));
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
        console.error("Drop error:", err);
      }
    });
  }
}
