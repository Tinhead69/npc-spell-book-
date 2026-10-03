import { MODULE_ID, getSpellbookSpells } from "./data.js";
import { bindSpellDescriptionTooltips, clearSpellTooltip } from "./spell-tooltip.js";
import {
  actorKnowsSpell,
  evaluateTranscription,
  getGold,
  getMaxSpellLevel,
  getTranscriptionCost,
  getTranscriptionHours,
  getWizardLevel,
  isWizard,
  transcribeSpell
} from "./mechanics.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Transcribe sheet — same visual language as the spellbook / picker sheets.
 */
export class TranscribeSpellsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.spellbook = options.spellbook;
    this.wizardActors = options.wizardActors ?? [];
    this.selectedWizard = options.selectedWizard ?? this.wizardActors[0] ?? null;
    this.collapsedLevels = new Set();
    this._unbindSpellTooltips = null;

    if (this.spellbook?.name && this.options.window) {
      this.options.window.title = `Transcribe Spells — ${this.spellbook.name}`;
    }
  }

  static DEFAULT_OPTIONS = {
    id: "npc-spellbook-transcribe",
    classes: ["npc-spellbook", "npc-spellbook-transcribe", "spellbook-sheet"],
    tag: "div",
    window: {
      title: "Transcribe Spells",
      icon: "fas fa-scroll",
      resizable: true
    },
    position: {
      width: 900,
      height: 650
    },
    actions: {
      toggleLevel: TranscribeSpellsApp._onToggleLevel,
      changeWizard: TranscribeSpellsApp._onChangeWizard,
      transcribeSpell: TranscribeSpellsApp._onTranscribeSpell
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/transcribe-spells.hbs`
    }
  };

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);

    // Native <select> change is more reliable than relying solely on data-action.
    this.element.addEventListener("change", (event) => {
      if (!event.target?.matches?.('select[name="wizardSelect"]')) return;
      TranscribeSpellsApp._onChangeWizard.call(this, event, event.target);
    });

    this._unbindSpellTooltips = bindSpellDescriptionTooltips(this.element, this);
  }

  /** @override */
  async close(options) {
    this._unbindSpellTooltips?.();
    this._unbindSpellTooltips = null;
    clearSpellTooltip(this, true);
    return super.close(options);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const wizard = this.selectedWizard;
    const wizardLevel = getWizardLevel(wizard);
    const maxSpellLevel = getMaxSpellLevel(wizardLevel);
    const spells = getSpellbookSpells(this.spellbook);

    context.spellbook = {
      name: this.spellbook?.name || "Spellbook",
      img: this.spellbook?.img || "icons/svg/book.svg"
    };

    context.wizards = this.wizardActors.map((actor) => ({
      uuid: actor.uuid,
      name: actor.name,
      selected: actor.uuid === wizard?.uuid
    }));

    context.wizardLevel = wizardLevel;
    context.maxSpellLevel = maxSpellLevel;
    context.gold = getGold(wizard);

    const levelMap = {};
    for (const spell of spells) {
      const level = Number(spell.level ?? spell.system?.level ?? 0);
      const cost = getTranscriptionCost(level);
      const hours = getTranscriptionHours(level);
      const evaluation = wizard
        ? evaluateTranscription(wizard, spell, { requireGold: true, checkAfford: true })
        : { canLearn: false, reasonKey: "No wizard selected", reasonText: "No wizard selected" };

      const isPresent = Boolean(wizard && (
        actorKnowsSpell(wizard, spell)
        || evaluation.reasonKey === "Already in spellbook"
      ));

      const row = {
        uuid: spell.uuid,
        name: spell.name,
        img: spell.img || "icons/svg/book.svg",
        level,
        cost,
        hours,
        costLabel: level < 1 ? "—" : `${cost} GP`,
        timeLabel: level < 1 ? "—" : `${hours} hr${hours === 1 ? "" : "s"}`,
        isPresent,
        canTranscribe: !isPresent && evaluation.canLearn,
        statusText: evaluation.reasonText || evaluation.reasonKey || ""
      };

      if (!levelMap[level]) {
        levelMap[level] = {
          level,
          label: level === 0 ? "CANTRIPS" : `LEVEL ${level}`,
          collapsed: this.collapsedLevels.has(level),
          spells: []
        };
      }
      levelMap[level].spells.push(row);
    }

    for (const group of Object.values(levelMap)) {
      group.spells.sort((a, b) => a.name.localeCompare(b.name));
    }

    context.spellGroups = Object.values(levelMap).sort((a, b) => a.level - b.level);
    return context;
  }

  static async _onChangeWizard(event, target) {
    const uuid = target?.value || event?.target?.value;
    if (!uuid) return;
    const actor = await fromUuid(uuid);
    if (!actor || !isWizard(actor)) return;
    this.selectedWizard = actor;
    clearSpellTooltip(this, true);
    this.render({ force: false });
  }

  static _onToggleLevel(event, target) {
    event.preventDefault();
    const level = Number(target.dataset.level);
    if (Number.isNaN(level)) return;
    if (this.collapsedLevels.has(level)) this.collapsedLevels.delete(level);
    else this.collapsedLevels.add(level);
    this.render({ force: false });
  }

  static async _onTranscribeSpell(event, target) {
    event.preventDefault();
    const uuid = target.dataset.uuid;
    const wizard = this.selectedWizard;
    if (!uuid || !wizard || !this.spellbook) return;

    clearSpellTooltip(this, true);

    const spellEntry = getSpellbookSpells(this.spellbook).find((s) => s.uuid === uuid);
    if (!spellEntry) return;

    target.disabled = true;
    const original = target.innerHTML;
    target.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Transcribing…`;

    const success = await transcribeSpell(wizard, spellEntry, this.spellbook, {
      deductGold: true,
      requireGold: true
    });

    if (success) {
      ui.notifications?.info(`Transcribed "${spellEntry.name}" into ${wizard.name}'s spellbook.`);
      // Refresh actor reference so item list includes the new spell.
      this.selectedWizard = game.actors.get(wizard.id) || wizard;
    } else {
      target.disabled = false;
      target.innerHTML = original;
      const evaluation = evaluateTranscription(wizard, spellEntry, { requireGold: true, checkAfford: true });
      ui.notifications?.warn(evaluation.reasonText || evaluation.reasonKey || "Could not transcribe spell.");
    }

    this.render({ force: false });
  }
}

/**
 * Open the transcribe sheet for a loot spellbook item.
 * @param {Item} sourceSpellbook
 */
export async function openTranscribeDialog(sourceSpellbook) {
  const spells = getSpellbookSpells(sourceSpellbook);
  if (!spells.length) {
    ui.notifications?.warn("There are no spells in this spellbook to transcribe.");
    return;
  }

  const wizardActors = game.actors.filter((actor) => isWizard(actor));
  if (!wizardActors.length) {
    ui.notifications?.warn("No Wizard actors found in this world.");
    return;
  }

  const controlled = canvas.tokens?.controlled?.[0]?.actor;
  const assigned = game.user?.character;
  const selectedWizard = (controlled && isWizard(controlled))
    ? controlled
    : (assigned && isWizard(assigned) ? assigned : wizardActors[0]);

  new TranscribeSpellsApp({
    spellbook: sourceSpellbook,
    wizardActors,
    selectedWizard
  }).render({ force: true });
}
