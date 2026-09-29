import { getTranscribedSpells } from "./data.js";

const GP_PER_LEVEL = 50;
const HOURS_PER_LEVEL = 2;

/**
 * PHB 2014: max spell slot level = ceil(wizardLevel / 2), capped at 9.
 * @param {number} wizardLevel
 * @returns {number}
 */
export function getMaxSpellLevel(wizardLevel) {
  if (wizardLevel <= 0) return 0;
  return Math.min(9, Math.ceil(wizardLevel / 2));
}

/**
 * @param {Actor} actor
 * @returns {number}
 */
export function getWizardLevel(actor) {
  if (!actor) return 0;

  const classItem = actor.items?.find((item) => {
    if (item.type !== "class") return false;
    const id = (item.system?.identifier ?? item.system?.slug ?? item.name ?? "").toLowerCase();
    return id === "wizard";
  });

  if (classItem) return Number(classItem.system?.levels ?? 0);

  // Legacy class object on actor.system.classes
  const legacy = actor.system?.classes?.wizard;
  if (legacy) return Number(legacy.levels ?? legacy.level ?? 0);

  return 0;
}

/**
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isWizard(actor) {
  return getWizardLevel(actor) > 0;
}

/**
 * @param {number} spellLevel
 * @returns {number}
 */
export function getTranscriptionCost(spellLevel) {
  return Math.max(0, spellLevel) * GP_PER_LEVEL;
}

/**
 * @param {number} spellLevel
 * @returns {number}
 */
export function getTranscriptionHours(spellLevel) {
  return Math.max(0, spellLevel) * HOURS_PER_LEVEL;
}

/**
 * @param {Actor} actor
 * @returns {number}
 */
export function getGold(actor) {
  return Number(actor.system?.currency?.gp ?? actor.system?.details?.currency?.gp ?? 0);
}

/**
 * @param {Actor} actor
 * @param {number} amount
 * @returns {Promise<void>}
 */
export async function deductGold(actor, amount) {
  if (amount <= 0) return;
  const current = getGold(actor);
  const gp = Math.max(0, current - amount);
  if ("currency" in (actor.system ?? {})) {
    await actor.update({ "system.currency.gp": gp });
  } else if (actor.system?.details?.currency) {
    await actor.update({ "system.details.currency.gp": gp });
  }
}

/**
 * @param {object} spellEntry
 * @returns {boolean}
 */
export function isWizardSpell(spellEntry) {
  // When adding from compendium items, level 0 cantrips are valid wizard spells.
  const level = Number(spellEntry.level ?? 0);
  return level >= 0 && level <= 9;
}

/**
 * @param {Actor} wizard
 * @param {object} spellEntry
 * @param {object} options
 * @param {boolean} [options.requireGold]
 * @param {boolean} [options.checkAfford]
 * @returns {{ canLearn: boolean, reasonKey: string, reasonData?: object }}
 */
export function evaluateTranscription(wizard, spellEntry, options = {}) {
  const { requireGold = true, checkAfford = true } = options;
  const wizardLevel = getWizardLevel(wizard);
  const maxLevel = getMaxSpellLevel(wizardLevel);
  const spellLevel = Number(spellEntry.level ?? 0);
  const cost = getTranscriptionCost(spellLevel);

  if (!isWizard(wizard)) {
    return { canLearn: false, reasonKey: "NPC_SPELLBOOK.Learn.Status.NotWizard" };
  }

  if (!isWizardSpell(spellEntry)) {
    return { canLearn: false, reasonKey: "NPC_SPELLBOOK.Learn.Status.NotWizardSpell" };
  }

  // PHB 2014: only spells of 1st level or higher can be copied from another spellbook.
  if (spellLevel < 1) {
    return { canLearn: false, reasonKey: "NPC_SPELLBOOK.Learn.Status.CantripNotCopyable" };
  }

  if (spellLevel > maxLevel) {
    return {
      canLearn: false,
      reasonKey: "NPC_SPELLBOOK.Learn.Status.TooHighLevel",
      reasonData: { max: maxLevel }
    };
  }

  const known = getTranscribedSpells(wizard);
  const alreadyKnown = known.some((s) => s.uuid === spellEntry.uuid || s.name === spellEntry.name);
  if (alreadyKnown) {
    return { canLearn: false, reasonKey: "NPC_SPELLBOOK.Learn.Status.AlreadyKnown" };
  }

  if (requireGold && checkAfford && cost > 0) {
    const gold = getGold(wizard);
    if (gold < cost) {
      return {
        canLearn: false,
        reasonKey: "NPC_SPELLBOOK.Learn.Status.CannotAfford",
        reasonData: { have: gold, need: cost }
      };
    }
  }

  return { canLearn: true, reasonKey: "NPC_SPELLBOOK.Learn.Status.Learnable" };
}

/**
 * @param {Actor} wizard
 * @param {object} spellEntry
 * @param {Item} sourceSpellbook
 * @param {object} options
 * @returns {Promise<boolean>}
 */
export async function transcribeSpell(wizard, spellEntry, sourceSpellbook, options = {}) {
  const deduct = options.deductGold ?? true;
  const requireGold = options.requireGold ?? true;

  const evaluation = evaluateTranscription(wizard, spellEntry, { requireGold, checkAfford: true });
  if (!evaluation.canLearn) return false;

  const spellLevel = Number(spellEntry.level ?? 0);
  const cost = getTranscriptionCost(spellLevel);

  if (deduct && cost > 0) {
    await deductGold(wizard, cost);
  }

  const transcribed = getTranscribedSpells(wizard);
  transcribed.push({
    uuid: spellEntry.uuid,
    name: spellEntry.name,
    level: spellLevel,
    img: spellEntry.img,
    sourceItemId: sourceSpellbook.id,
    sourceItemName: sourceSpellbook.name,
    transcribedAt: Date.now()
  });

  await wizard.setFlag("npc-spell-book", "transcribedSpells", transcribed);
  return true;
}
