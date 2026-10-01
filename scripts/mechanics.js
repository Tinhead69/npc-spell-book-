import { MODULE_ID, getTranscribedSpells } from "./data.js";

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
  const level = Number(spellEntry.level ?? 0);
  return level >= 0 && level <= 9;
}

/**
 * Does this actor already have this spell in their dnd5e spell list?
 * @param {Actor} actor
 * @param {object} spellEntry
 * @returns {boolean}
 */
export function actorKnowsSpell(actor, spellEntry) {
  if (!actor?.items) return false;
  const targetName = (spellEntry.name ?? "").toLowerCase();
  const targetUuid = spellEntry.uuid ?? "";

  return actor.items.some((item) => {
    if (item.type !== "spell") return false;
    if (item.name?.toLowerCase() === targetName) return true;

    const sourceUuid = item._stats?.compendiumSource ?? item.flags?.core?.sourceId ?? "";
    if (targetUuid && sourceUuid && sourceUuid === targetUuid) return true;

    const moduleSource = item.flags?.[MODULE_ID]?.sourceSpellUuid;
    if (targetUuid && moduleSource === targetUuid) return true;

    return false;
  });
}

/**
 * Build embedded spell item data suitable for a wizard's spellbook.
 * @param {Item} spellDoc
 * @param {Item} sourceSpellbook
 * @returns {object}
 */
function buildSpellbookItemData(spellDoc, sourceSpellbook) {
  let data;
  if (game.items?.fromCompendium && spellDoc.pack) {
    data = game.items.fromCompendium(spellDoc, { clearFolder: true, keepId: false });
  } else {
    data = spellDoc.toObject();
    delete data._id;
    delete data.folder;
    delete data.sort;
    if (data.flags?.core) delete data.flags.core.sourceId;
  }

  data.name = spellDoc.name;
  data.type = "spell";
  data.img = spellDoc.img;

  data.system = data.system ?? {};
  data.system.preparation = foundry.utils.mergeObject(
    data.system.preparation ?? {},
    { mode: "prepared", prepared: false },
    { inplace: false }
  );

  if ("method" in (spellDoc.system ?? {}) || "method" in data.system) {
    data.system.method = data.system.method ?? "spell";
  }

  data.flags = data.flags ?? {};
  data.flags[MODULE_ID] = foundry.utils.mergeObject(data.flags[MODULE_ID] ?? {}, {
    sourceSpellUuid: spellDoc.uuid,
    sourceSpellbookId: sourceSpellbook.id,
    sourceSpellbookName: sourceSpellbook.name,
    transcribedAt: Date.now()
  }, { inplace: false });

  data.flags.core = data.flags.core ?? {};
  data.flags.core.sourceId = spellDoc.uuid;

  return data;
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

  if (actorKnowsSpell(wizard, spellEntry)) {
    return { canLearn: false, reasonKey: "NPC_SPELLBOOK.Learn.Status.AlreadyKnown" };
  }

  const known = getTranscribedSpells(wizard);
  if (known.some((s) => s.uuid === spellEntry.uuid || s.name === spellEntry.name)) {
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
 * Copy spell into the wizard's dnd5e spellbook and record module metadata.
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

  const spellDoc = spellEntry.uuid ? await fromUuid(spellEntry.uuid) : null;
  if (!spellDoc || spellDoc.type !== "spell") {
    ui.notifications.error(`Could not resolve spell "${spellEntry.name}" from its source.`);
    return false;
  }

  const spellLevel = Number(spellEntry.level ?? spellDoc.system?.level ?? 0);
  const cost = getTranscriptionCost(spellLevel);

  if (deduct && cost > 0) {
    await deductGold(wizard, cost);
  }

  const itemData = buildSpellbookItemData(spellDoc, sourceSpellbook);
  await wizard.createEmbeddedDocuments("Item", [itemData]);

  const transcribed = getTranscribedSpells(wizard);
  transcribed.push({
    uuid: spellDoc.uuid,
    name: spellDoc.name,
    level: spellLevel,
    img: spellDoc.img,
    sourceItemId: sourceSpellbook.id,
    sourceItemName: sourceSpellbook.name,
    transcribedAt: Date.now()
  });
  await wizard.setFlag(MODULE_ID, "transcribedSpells", transcribed);

  return true;
}