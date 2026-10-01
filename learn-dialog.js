import { getSpellbookSpells } from "./data.js";
import {
  getWizardLevel,
  getMaxSpellLevel,
  getGold,
  getTranscriptionCost,
  getTranscriptionHours,
  evaluateTranscription,
  transcribeSpell,
  isWizard
} from "./mechanics.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class StudySpellbookDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.spellbook = options.spellbook;
    this.selectedWizardId = options.selectedWizardId ?? null;
  }

  static DEFAULT_OPTIONS = {
    id: "study-spellbook-dialog",
    classes: ["study-spellbook"],
    position: {
      width: 620,
      height: 650
    },
    tag: "div"
  };

  static PARTS = {
    main: {
      template: "modules/npc-spell-book/templates/learn-spells.hbs"
    }
  };

  get title() {
    return `Study Spellbook: ${this.spellbook?.name ?? "Spellbook"}`;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // 1. Find all available wizard actors (strictly wizards only)
    const wizards = game.actors.filter((a) => {
      if (a.type !== "character") return false;
      return isWizard(a);
    });

    // Auto-select first wizard if none selected
    if (!this.selectedWizardId && wizards.length > 0) {
      this.selectedWizardId = wizards[0].id;
    }

    const currentWizard = wizards.find((w) => w.id === this.selectedWizardId) ?? null;

    context.wizards = wizards.map((w) => ({
      id: w.id,
      name: w.name,
      selected: w.id === this.selectedWizardId
    }));

    if (currentWizard) {
      const wizardLevel = getWizardLevel(currentWizard);
      context.currentWizard = {
        id: currentWizard.id,
        name: currentWizard.name,
        level: wizardLevel,
        maxSpellLevel: getMaxSpellLevel(wizardLevel),
        gold: getGold(currentWizard)
      };
    } else {
      context.currentWizard = null;
    }

    // 2. Fetch raw spells from the spellbook
    const rawSpells = getSpellbookSpells(this.spellbook);

    // 3. Group spells by level into an object { "0": [...], "1": [...] }
    const spellLevels = {};

    for (const spell of rawSpells) {
      const level = Number(spell.level ?? 0);
      if (!spellLevels[level]) spellLevels[level] = [];

      let canLearn = false;
      let statusText = "";

      if (currentWizard) {
        const evalResult = evaluateTranscription(currentWizard, spell);
        canLearn = evalResult.canLearn;
        
        // Human-readable status texts
        if (level === 0) {
          statusText = "Cantrips cannot be transcribed (PHB 2014)";
        } else if (evalResult.reasonKey) {
          if (evalResult.reasonKey.includes("AlreadyKnown")) {
            statusText = "Already transcribed";
          } else if (evalResult.reasonKey.includes("TooHighLevel")) {
            statusText = `Spell level too high (Max: ${context.currentWizard?.maxSpellLevel})`;
          } else if (evalResult.reasonKey.includes("CannotAfford")) {
            statusText = "Cannot afford gold cost";
          } else if (evalResult.reasonKey.includes("NotWizard")) {
            statusText = "Not a Wizard";
          } else if (evalResult.canLearn) {
            statusText = "Ready to transcribe";
          } else {
            statusText = "Cannot transcribe";
          }
        }
      } else {
        statusText = "Select a wizard";
      }

      spellLevels[level].push({
        id: spell.id ?? spell.uuid,
        uuid: spell.uuid,
        name: spell.name,
        img: spell.img || "icons/svg/spell-magic.svg",
        level: level,
        components: spell.components ?? "",
        cost: getTranscriptionCost(level),
        hours: getTranscriptionHours(level),
        canLearn: canLearn,
        statusText: statusText
      });
    }

    context.spellLevels = spellLevels;
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    // Handle Wizard selection change
    const select = html.querySelector("#wizard-select");
    if (select) {
      select.addEventListener("change", (e) => {
        this.selectedWizardId = e.target.value;
        this.render(false);
      });
    }

    // Handle Transcribe / Copy button clicks
    html.querySelectorAll(".transcribe-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const spellId = e.currentTarget.dataset.spellId;
        const currentWizard = game.actors.get(this.selectedWizardId);

        if (!currentWizard || !this.spellbook) return;

        const rawSpells = getSpellbookSpells(this.spellbook);
        const spellEntry = rawSpells.find((s) => (s.id ?? s.uuid) === spellId);

        if (spellEntry) {
          btn.disabled = true;
          const success = await transcribeSpell(currentWizard, spellEntry, this.spellbook);
          if (success) {
            ui.notifications.info(`Successfully transcribed "${spellEntry.name}" to ${currentWizard.name}'s spellbook.`);
          }
          this.render(false);
        }
      });
    });
  }
}
