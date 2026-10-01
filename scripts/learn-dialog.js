import * as Data from "./data.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class StudySpellbookDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.spellbook = options.spellbook;
  }

  static DEFAULT_OPTIONS = {
    id: "study-spellbook-dialog",
    classes: ["npc-spellbook", "dialog"],
    tag: "form",
    window: {
      title: "Study Spellbook",
      icon: "fas fa-graduation-cap",
      resizable: true
    },
    position: {
      width: 500,
      height: 500
    },
    actions: {
      learnSpell: StudySpellbookDialog._onLearnSpell
    }
  };

  static PARTS = {
    body: {
      template: "modules/npc-spell-book/templates/learn-spells.hbs"
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.spellbook = this.spellbook;

    // Get controlled actor or user's assigned character
    const actor = canvas.tokens.controlled[0]?.actor || game.user.character;
    context.actor = actor;
    context.hasActor = Boolean(actor);

    const spells = Data.getSpellbookSpells(this.spellbook);
    
    // Check which spells the actor already knows
    if (actor) {
      const knownNames = new Set(
        actor.items.filter((i) => i.type === "spell").map((s) => s.name.toLowerCase())
      );
      context.spells = spells.map((s) => ({
        ...s,
        isKnown: knownNames.has(s.name.toLowerCase())
      }));
    } else {
      context.spells = spells;
    }

    return context;
  }

  static async _onLearnSpell(event, target) {
    event.preventDefault();
    const spellUuid = target.dataset.spellUuid || target.dataset.spellId;
    const actor = canvas.tokens.controlled[0]?.actor || game.user.character;

    if (!actor) {
      ui.notifications.warn("Please select a token or assign a character first.");
      return;
    }

    try {
      const spellDoc = await fromUuid(spellUuid);
      if (spellDoc) {
        await actor.createEmbeddedDocuments("Item", [spellDoc.toObject()]);
        ui.notifications.info(`${actor.name} learned ${spellDoc.name}!`);
        this.render(false);
      } else {
        ui.notifications.error("Could not find source spell document.");
      }
    } catch (err) {
      console.error("NPC Spellbook | Failed to learn spell:", err);
    }
  }
}
