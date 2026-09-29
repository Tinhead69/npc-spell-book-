// Inside StudySpellbookDialog in learn-dialog.js

async _prepareContext() {
  const wizards = this._getAvailableWizards();
  const wizard = this.selectedWizard ?? wizards[0] ?? null;
  const wizardLevel = wizard ? getWizardLevel(wizard) : 0;
  const maxLevel = getMaxSpellLevel(wizardLevel);
  const requireGold = game.settings.get("npc-spell-book", "requireGold");

  // 1. Map raw spell data and evaluate learning status
  let spells = getSpellbookSpells(this.spellbook).map((spell) => {
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

  // 2. SORT THE SPELLS ARRAY HERE (e.g. by availability, level, or name)
  const sortBy = this.currentSort ?? "level"; // "level" | "name" | "availability"

  spells.sort((a, b) => {
    if (sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    
    if (sortBy === "availability") {
      // Show learnable spells first
      if (a.canLearn !== b.canLearn) return a.canLearn ? -1 : 1;
      return a.level - b.level || a.name.localeCompare(b.name);
    }

    // Default: Sort by Level, then Name
    return a.level - b.level || a.name.localeCompare(b.name);
  });

  return {
    spellbook: this.spellbook,
    wizards: wizards.map((w) => ({ id: w.id, name: w.name, selected: wizard?.id === w.id })),
    wizard,
    wizardLevel,
    maxLevel,
    spells,
    hasWizard: Boolean(wizard),
    currentSort: sortBy
  };
}
