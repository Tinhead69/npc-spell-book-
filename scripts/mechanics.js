import { MODULE_ID, isWizardSpell } from "./data.js";

const GP_PER_LEVEL = 50;
const HOURS_PER_LEVEL = 2;

/**
 * Safely retrieve transcribed spells recorded on an actor.
 * @param {Actor} actor
 * @returns {Array}
 */
export function getTranscribedSpells(actor) {
  return actor?.getFlag(MODULE_ID, "transcribedSpells") ?? [];
}

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

/** Fallback dnd5e rates: conversion = coins needed for 1 gp. */
const FALLBACK_CURRENCY_CONVERSION = {
  pp: 0.1,
  gp: 1,
  ep: 2,
  sp: 10,
  cp: 100
};

function getActorCurrency(actor) {
  return actor?.system?.currency ?? actor?.system?.details?.currency ?? {};
}

function getCurrencyConversion(denom) {
  const fromConfig = CONFIG.DND5E?.currencies?.[denom]?.conversion;
  if (Number.isFinite(Number(fromConfig)) && Number(fromConfig) > 0) return Number(fromConfig);
  return FALLBACK_CURRENCY_CONVERSION[denom] ?? null;
}

/** Copper value of one coin of the given denomination. */
function copperPerCoin(denom) {
  const conversion = getCurrencyConversion(denom);
  if (!conversion) return 0;
  return Math.round(100 / conversion);
}

/**
 * Total carried wealth in gold pieces (all coin types converted).
 * @param {Actor} actor
 * @returns {number}
 */
export function getGold(actor) {
  const currency = getActorCurrency(actor);
  let totalGp = 0;
  for (const [denom, amount] of Object.entries(currency)) {
    const conversion = getCurrencyConversion(denom);
    if (!conversion) continue;
    totalGp += Number(amount || 0) / conversion;
  }
  return totalGp;
}

/**
 * Deduct a gold-piece cost using all denominations, then re-normalize the purse.
 * @param {Actor} actor
 * @param {number} amount Cost in GP
 * @returns {Promise<void>}
 */
export async function deductGold(actor, amount) {
  if (amount <= 0) return;

  const costCP = Math.round(Number(amount) * 100);
  const currency = getActorCurrency(actor);
  const denoms = Object.keys(CONFIG.DND5E?.currencies ?? FALLBACK_CURRENCY_CONVERSION);

  let totalCP = 0;
  for (const denom of denoms) {
    totalCP += Math.round(Number(currency[denom] || 0) * copperPerCoin(denom));
  }

  if (totalCP < costCP) {
    throw new Error(`Insufficient funds: need ${amount} GP, have ${getGold(actor)} GP equivalent.`);
  }

  // Convert remaining copper back into coins, highest value first (pp → cp).
  let remaining = totalCP - costCP;
  const ordered = [...denoms].sort(
    (a, b) => (getCurrencyConversion(a) ?? 999) - (getCurrencyConversion(b) ?? 999)
  );

  const update = {};
  const pathPrefix = "currency" in (actor.system ?? {})
    ? "system.currency"
    : "system.details.currency";

  for (const denom of ordered) {
    const per = copperPerCoin(denom);
    if (per <= 0) {
      update[`${pathPrefix}.${denom}`] = 0;
      continue;
    }
    const coins = Math.floor(remaining / per);
    update[`${pathPrefix}.${denom}`] = coins;
    remaining -= coins * per;
  }

  await actor.update(update);
}

export { isWizardSpell };

/**
 * Does this actor already have this spell in their dnd5e spell list?
 * @param {Actor} actor
 * @param {object} spellEntry
 * @returns {boolean}
 */
function normalizeSpellName(name) {
  return String(name ?? "")
    .toLowerCase()
    // Strip edition tags: "(Legacy)", "(2024)", trailing "2014"/"2024"
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s+20(14|24)\s*$/i, "")
    .trim();
}

/**
 * Does this actor already have this spell in their dnd5e spell list / spellbook?
 * Compares by identifier, normalized name, and source UUIDs.
 */
export function actorKnowsSpell(actor, spellEntry) {
  if (!actor?.items) return false;

  const targetName = normalizeSpellName(spellEntry.name);
  const targetUuid = spellEntry.uuid ?? "";
  const targetId = String(
    spellEntry.system?.identifier || spellEntry.identifier || ""
  ).toLowerCase().trim();

  return actor.items.some((item) => {
    if (item.type !== "spell") return false;

    const itemId = String(item.system?.identifier || "").toLowerCase().trim();
    if (targetId && itemId && targetId === itemId) return true;

    if (targetName && normalizeSpellName(item.name) === targetName) return true;

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
  const spellLevel = Number(spellEntry.level ?? spellEntry.system?.level ?? 0);
  const cost = getTranscriptionCost(spellLevel);

  if (!isWizard(wizard)) {
    return { canLearn: false, reasonKey: "notWizard", reasonText: "Not a Wizard" };
  }

  if (!isWizardSpell(spellEntry)) {
    return { canLearn: false, reasonKey: "notOnList", reasonText: "Not on the Wizard spell list" };
  }

  if (spellLevel < 1) {
    return { canLearn: false, reasonKey: "cantrip", reasonText: "Cantrips cannot be transcribed" };
  }

  if (spellLevel > maxLevel) {
    return {
      canLearn: false,
      reasonKey: "levelTooHigh",
      reasonText: "Your current level does not allow transcription of this spell."
    };
  }

  // Only the actor's actual spell items count — module transcription flags can go stale
  // if the player deletes the spell from their sheet afterward.
  if (actorKnowsSpell(wizard, spellEntry)) {
    return { canLearn: false, reasonKey: "Already in spellbook", reasonText: "In Spellbook" };
  }

  if (requireGold && checkAfford && cost > 0) {
    const wealth = getGold(wizard);
    if (wealth + 1e-9 < cost) {
      return {
        canLearn: false,
        reasonKey: "cannotAfford",
        reasonText: `Cannot afford (${cost} GP; have ${Math.floor(wealth * 100) / 100} GP in coin)`
      };
    }
  }

  return { canLearn: true, reasonKey: "Learnable", reasonText: "Learnable" };
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

  const transcribed = Array.from(getTranscribedSpells(wizard));
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
