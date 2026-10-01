export const MODULE_ID = "npc-spell-book";
export const SPELLBOOK_ICON = "icons/svg/book.svg";

/** @typedef {{ uuid: string, name: string, level: number, img?: string }} SpellEntry */
/** @typedef {{ uuid: string, name: string, level: number, img?: string, sourceItemId: string, sourceItemName: string, transcribedAt: number }} TranscribedEntry */

/**
 * @param {Item} item
 * @returns {boolean}
 */
export function isSpellbook(item) {
  return item?.getFlag(MODULE_ID, "isSpellbook") === true;
}

/**
 * @param {Item} item
 * @returns {Promise<void>}
 */
export async function markAsSpellbook(item) {
  await item.setFlag(MODULE_ID, "isSpellbook", true);
  if (!item.getFlag(MODULE_ID, "spells")) {
    await item.setFlag(MODULE_ID, "spells", []);
  }
  await item.setFlag("core", "sheetClass", `${MODULE_ID}.SpellbookItemSheet`);
}

/**
 * @param {Item} item
 * @returns {SpellEntry[]}
 */
export function getSpellbookSpells(item) {
  return /** @type {SpellEntry[]} */ (item?.getFlag(MODULE_ID, "spells") ?? []);
}

/**
 * @param {Item} item
 * @param {SpellEntry[]} spells
 * @returns {Promise<void>}
 */
export async function setSpellbookSpells(item, spells) {
  await item.setFlag(MODULE_ID, "spells", spells);
}

/**
 * @param {Actor} actor
 * @returns {TranscribedEntry[]}
 */
export function getTranscribedSpells(actor) {
  return /** @type {TranscribedEntry[]} */ (actor?.getFlag(MODULE_ID, "transcribedSpells") ?? []);
}

/**
 * @param {Actor} actor
 * @param {TranscribedEntry[]} spells
 * @returns {Promise<void>}
 */
export async function setTranscribedSpells(actor, spells) {
  await actor.setFlag(MODULE_ID, "transcribedSpells", spells);
}

/**
 * @param {Item} spellItem
 * @returns {SpellEntry}
 */
export function spellItemToEntry(spellItem) {
  const level = Number(spellItem.system?.level ?? spellItem.system?.attributes?.level ?? 0);
  return {
    uuid: spellItem.uuid ?? spellItem.getUuid?.() ?? "",
    name: spellItem.name,
    level,
    img: spellItem.img
  };
}

/**
 * @param {HTMLElement} li
 * @returns {string|null}
 */
export function getEntryId(li) {
  return (
    li?.dataset?.entryId ??
    li?.dataset?.documentId ??
    li?.getAttribute?.("data-entry-id") ??
    li?.getAttribute?.("data-document-id") ??
    null
  );
}