import { getSpellbookSpells } from "./data.js";
import {
  evaluateTranscription,
  getMaxSpellLevel,
  getTranscriptionCost,
  getTranscriptionHours,
  getWizardLevel,
  isWizard,
  transcribeSpell
} from "./mechanics.js";

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;

/**
 * @typedef {object} StudySpellbookOptions
 * @property {Item} spellbook
 * @property {Actor} [wizard]
 */

export class StudySpellbookDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @param {StudySpellbookOptions} options */
  constructor(options) {
    super(options);
    this.spellbook = options.spellbook;
    this.selectedWizard = options.wizard ?? null;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "study-spellbook",
    classes: ["npc-spell-book", "study-spellbook"],
    position: { width: 560, height: 640 },
    window: { title: "Study Spellbook" },
    actions: {
      selectWizard: StudySpellbookDialog.#onSelectWizard,
      transcribe: StudySpellbookDialog.#onTranscribe
    }
  };

  /** @override */
  static PARTS = {
    body: { template: "modules/npc-spell-book/templates/learn-spells.hbs" }
  };

  /** @override */
  get title() {
    return game.i18n.format("NPC_SPELLBOOK.Learn.Title", { name: this.spellbook.name });
  }

  /** @returns {Actor[]} */
  _getAvailableWizards() {
    const owned = game.user.character && isWizard(game.user.character) ? [game.user.character] : [];
    const party = game.actors.filter((a) => a.type === "character" && a.hasPlayerOwner && isWizard(a));
    const all = [...owned, ...party];
    return [...new Map(all.map((a) => [a.id, a])).values()];
  }

  /** @override */
  async _prepareContext() {
    const wizards = this._getAvailableWizards();
    const wizard = this.selectedWizard ?? wizards[0] ?? null;
    const wizardLevel = wizard ? getWizardLevel(wizard) : 0;
    const maxLevel = getMaxSpellLevel(wizardLevel);
    const requireGold = game.settings.get("npc-spell-book", "requireGold");
    const spells = getSpellbookSpells(this.spellbook).map((spell) => {
      const evaluation = wizard
        ? evaluateTranscription(wizard, spell, { requireGold, checkAfford: requireGold })
        : { canLearn: false, reasonKey: "NPC_SPELLBOOK.Learn.SelectWizard" };
      return {
        ...spell,
        cost: getTranscriptionCost(spell.level),
        hours: getTranscriptionHours(spell.level),
        canLearn: evaluation.canLearn,
        statusLabel: game.i18n.format(evaluation.reasonKey, evaluation.reasonData ?? {})
      };
    });

    return {
      spellbook: this.spellbook,
      wizards: wizards.map((w) => ({ id: w.id, name: w.name, selected: wizard?.id === w.id })),
      wizard,
      wizardLevel,
      maxLevel,
      spells,
      hasWizard: Boolean(wizard)
    };
  }

  static #onSelectWizard(event, target) {
    const dialog = /** @type {StudySpellbookDialog} */ (this);
    const wizardId = target.closest("[data-wizard-id]")?.dataset?.wizardId;
    if (!wizardId) return;
    dialog.selectedWizard = game.actors.get(wizardId) ?? null;
    dialog.render(false);
  }

  static async #onTranscribe(event, target) {
    const dialog = /** @type {StudySpellbookDialog} */ (this);
    const spellUuid = target.closest("[data-spell-uuid]")?.dataset?.spellUuid;
    const wizard = dialog.selectedWizard ?? dialog._getAvailableWizards()[0];
    if (!wizard || !spellUuid) return;

    const spell = getSpellbookSpells(dialog.spellbook).find((s) => s.uuid === spellUuid);
    if (!spell) return;

    const requireGold = game.settings.get("npc-spell-book", "requireGold");
    const deductGold = game.settings.get("npc-spell-book", "deductGold");
    const evaluation = evaluateTranscription(wizard, spell, { requireGold, checkAfford: requireGold });
    if (!evaluation.canLearn) {
      ui.notifications.warn(game.i18n.format(evaluation.reasonKey, evaluation.reasonData ?? {}));
      return;
    }

    const cost = getTranscriptionCost(spell.level);
    const hours = getTranscriptionHours(spell.level);
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.format("NPC_SPELLBOOK.Learn.ConfirmTitle", { spell: spell.name }) },
      content: game.i18n.format("NPC_SPELLBOOK.Learn.ConfirmContent", {
        spell: spell.name,
        level: spell.level,
        cost,
        hours
      })
    });

    if (!confirmed) return;

    const success = await transcribeSpell(wizard, spell, dialog.spellbook, { deductGold, requireGold });
    if (success) {
      ui.notifications.info(
        game.i18n.format("NPC_SPELLBOOK.Learn.Success", { wizard: wizard.name, spell: spell.name })
      );
      dialog.render(false);
    } else {
      ui.notifications.error(game.i18n.format("NPC_SPELLBOOK.Learn.Failed", { spell: spell.name }));
    }
  }
}

export class TranscribedSpellsDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @param {{ actor: Actor }} options */
  constructor(options) {
    super(options);
    this.actor = options.actor;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "transcribed-spells",
    classes: ["npc-spell-book", "transcribed-spells"],
    position: { width: 480, height: 520 },
    window: { title: "Transcribed Spells" }
  };

  /** @override */
  static PARTS = {
    body: { template: "modules/npc-spell-book/templates/transcribed-spells.hbs" }
  };

  /** @override */
  get title() {
    return game.i18n.format("NPC_SPELLBOOK.Transcribed.Title", { name: this.actor.name });
  }

  /** @override */
  async _prepareContext() {
    const spells = (this.actor.getFlag("npc-spell-book", "transcribedSpells") ?? [])
      .slice()
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
      .map((s) => ({
        ...s,
        sourceLabel: game.i18n.format("NPC_SPELLBOOK.Transcribed.Source", { source: s.sourceItemName }),
        levelLabel: game.i18n.format("NPC_SPELLBOOK.Transcribed.Level", { level: s.level })
      }));

    return { actor: this.actor, spells, empty: spells.length === 0 };
  }
}
