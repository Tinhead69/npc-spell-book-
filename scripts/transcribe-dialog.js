import { MODULE_ID, getSpellbookSpells } from "./data.js";
import { bindSpellDescriptionTooltips, clearSpellTooltip } from "./spell-tooltip.js";
import {
  actorKnowsSpell,
  evaluateTranscription,
  getGold,
  getMaxSpellLevel,
  getTranscribedSpells,
  getTranscriptionCost,
  getTranscriptionHours,
  getWizardLevel,
  isWizard,
  transcribeSpell
} from "./mechanics.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Resolve the world/base actor that owns an inventory spellbook, if any.
 * @param {Item} spellbook
 * @returns {Actor|null}
 */
function getSpellbookOwnerActor(spellbook) {
  const owner = spellbook?.actor;
  if (!owner) return null;
  // Prefer the base world actor over a synthetic token actor.
  if (owner.id && game.actors?.get) {
    return game.actors.get(owner.id) || owner;
  }
  return owner;
}

/**
 * Wizards allowed in the transcribe dropdown.
 * Owned inventory books: only the owning actor (if a wizard).
 * World books: all wizard actors.
 * @param {Item} spellbook
 * @returns {Actor[]}
 */
function getEligibleWizardActors(spellbook) {
  const owner = getSpellbookOwnerActor(spellbook);
  if (owner) {
    return isWizard(owner) ? [owner] : [];
  }
  return game.actors.filter((actor) => isWizard(actor));
}

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

    // Do not use data-action on <select> — AppV2 click handlers re-render and close the dropdown.
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

  /**
   * Re-resolve the loot book and selected wizard from live documents.
   * Spellbooks may live in the world OR on an actor's inventory.
   */
  _refreshDocuments() {
    const bookUuid = this.spellbook?.uuid;
    if (bookUuid && typeof fromUuidSync === "function") {
      try {
        this.spellbook = fromUuidSync(bookUuid) || this.spellbook;
      } catch (_) { /* keep existing ref */ }
    } else if (this.spellbook?.id) {
      this.spellbook = game.items.get(this.spellbook.id) || this.spellbook;
    }

    this.wizardActors = getEligibleWizardActors(this.spellbook);

    const selectedId = this.selectedWizard?.id;
    const selectedUuid = this.selectedWizard?.uuid;
    const stillEligible = this.wizardActors.find((actor) =>
      (selectedId && actor.id === selectedId)
      || (selectedUuid && actor.uuid === selectedUuid)
    );
    this.selectedWizard = stillEligible || this.wizardActors[0] || null;
  }

  /**
   * Drop module transcription log entries for spells no longer on the actor.
   * Prevents a deleted spell from staying locked as "In Spellbook".
   */
  async _pruneStaleTranscriptionLog(wizard) {
    if (!wizard) return;
    const logged = getTranscribedSpells(wizard);
    if (!logged.length) return;

    const kept = logged.filter((entry) => actorKnowsSpell(wizard, entry));
    if (kept.length === logged.length) return;

    try {
      await wizard.setFlag(MODULE_ID, "transcribedSpells", kept);
    } catch (err) {
      console.warn("NPC Spellbook | Failed to prune transcription log", err);
    }
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Every open / re-render: compare live actor spellbook vs item spellbook.
    this._refreshDocuments();
    await this._pruneStaleTranscriptionLog(this.selectedWizard);

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
      selected: actor.uuid === wizard?.uuid || actor.id === wizard?.id
    }));

    context.wizardLevel = wizardLevel;
    context.maxSpellLevel = maxSpellLevel;
    // Total wealth across pp/gp/ep/sp/cp, shown as GP equivalent.
    context.gold = Math.floor(getGold(wizard) * 100) / 100;

    const levelMap = {};
    for (const spell of spells) {
      const level = Number(spell.level ?? spell.system?.level ?? 0);
      const cost = getTranscriptionCost(level);
      const hours = getTranscriptionHours(level);

      // Primary check: is this spell already on the actor?
      const isPresent = Boolean(wizard && actorKnowsSpell(wizard, spell));

      const evaluation = wizard
        ? evaluateTranscription(wizard, spell, { requireGold: true, checkAfford: true })
        : { canLearn: false, reasonKey: "No wizard selected", reasonText: "No wizard selected" };

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
        statusText: isPresent
          ? "In Spellbook"
          : (evaluation.reasonText || evaluation.reasonKey || "")
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
    // Inventory books only allow the owner; ignore anything outside the eligible list.
    if (!this.wizardActors.some((a) => a.id === actor.id || a.uuid === actor.uuid)) return;
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
  // Resolve world items or actor-owned inventory items via UUID.
  let spellbook = sourceSpellbook;
  if (sourceSpellbook?.uuid) {
    try {
      spellbook = (await fromUuid(sourceSpellbook.uuid)) || sourceSpellbook;
    } catch (_) {
      spellbook = sourceSpellbook;
    }
  } else if (sourceSpellbook?.id) {
    spellbook = game.items.get(sourceSpellbook.id) || sourceSpellbook;
  }

  const spells = getSpellbookSpells(spellbook);
  if (!spells.length) {
    ui.notifications?.warn("There are no spells in this spellbook to transcribe.");
    return;
  }

  const wizardActors = getEligibleWizardActors(spellbook);
  const owner = getSpellbookOwnerActor(spellbook);

  if (!wizardActors.length) {
    ui.notifications?.warn("Only a Wizard May transcribe spells");
    return;
  }

  // Inventory books: always the owner. World books: controlled → assigned → first.
  let selectedWizard = wizardActors[0];
  if (!owner) {
    const controlled = canvas.tokens?.controlled?.[0]?.actor;
    const controlledBase = controlled?.id ? game.actors.get(controlled.id) : controlled;
    const assigned = game.user?.character;
    if (controlledBase && isWizard(controlledBase) && wizardActors.some((a) => a.id === controlledBase.id)) {
      selectedWizard = controlledBase;
    } else if (assigned && isWizard(assigned) && wizardActors.some((a) => a.id === assigned.id)) {
      selectedWizard = assigned;
    }
  }

  new TranscribeSpellsApp({
    spellbook,
    wizardActors,
    selectedWizard
  }).render({ force: true });
}
