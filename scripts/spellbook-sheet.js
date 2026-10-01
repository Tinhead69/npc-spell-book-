import * as Data from "./data.js";

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
      studySpellbook: NpcSpellbookSheet._onStudySpellbook
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

    // Fetch raw spell array from flags
    const spells = Data.getSpellbookSpells(item) ?? [];

    context.item = item;
    context.isGM = game.user.isGM;
    context.spells = spells;
    context.hasSpells = spells.length > 0;

    // Group spells by level (Cantrips = 0, 1st level = 1, etc.)
    const spellLevels = {};
    for (const spell of spells) {
      const lvl = Number(spell.level ?? 0);
      if (!spellLevels[lvl]) spellLevels[lvl] = [];
      spellLevels[lvl].push(spell);
    }

    // Convert to sorted array for Handlebars iteration
    context.spellLevels = Object.entries(spellLevels)
      .map(([level, list]) => ({
        level: Number(level),
        label: Number(level) === 0 ? "Cantrips" : `Level ${level}`,
        spells: list
      }))
      .sort((a, b) => a.level - b.level);

    return context;
  }

  /** Action Handler: Open Study / Learn Dialog safely */
  static async _onStudySpellbook(event, target) {
    event.preventDefault();
    try {
      const { StudySpellbookDialog } = await import("./learn-dialog.js");
      new StudySpellbookDialog({ spellbook: this.document }).render(true);
    } catch (err) {
      console.error("NPC Spellbook | Error loading StudySpellbookDialog:", err);
      ui.notifications.error("Could not open Study Spellbook dialog.");
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
