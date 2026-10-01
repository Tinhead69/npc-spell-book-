export const MODULE_ID = "npc-spell-book";

// Icon used for the spellbook item sheet registration
export const SPELLBOOK_ICON = "icons/svg/book.svg";

/**
 * Checks if an item is a spellbook.
 */
export function isSpellbook(item) {
  return item?.type === "spellbook" || item?.flags?.[MODULE_ID]?.isSpellbook;
}

/**
 * Marks an item as a spellbook.
 */
export async function markAsSpellbook(item) {
  await item.setFlag(MODULE_ID, "isSpellbook", true);
}

/**
 * Helper to safely get an entry ID or identifier.
 */
export function getEntryId(doc) {
  return doc?._id || doc?.id || foundry.utils.randomID();
}

/**
 * Retrieves the stored spells array from the spellbook item.
 * @param {Item} item - The spellbook item.
 * @returns {Array} List of stored spells.
 */
export function getSpellbookSpells(item) {
  let rawSpells =
    item.getFlag(MODULE_ID, "spells") ||
    item.flags?.[MODULE_ID]?.spells ||
    item.system?.spells ||
    [];

  if (!Array.isArray(rawSpells) && typeof rawSpells === "object") {
    rawSpells = Object.values(rawSpells);
  }
  return rawSpells;
}

/**
 * Adds a spell document to the spellbook item's flags and system data.
 * @param {Item} spellbook - The spellbook item.
 * @param {Item} spellDoc - The spell document being added.
 */
export async function addSpellToSpellbook(spellbook, spellDoc) {
  let rawSpells = getSpellbookSpells(spellbook);

  // Prevent duplicates based on uuid, id, or name
  const spellData = spellDoc.toObject();
  const uuid = spellDoc.uuid;

  if (rawSpells.some(s => s.uuid === uuid || s._id === spellDoc.id || s.name === spellDoc.name)) {
    return;
  }

  rawSpells.push(spellData);

  await spellbook.setFlag(MODULE_ID, "spells", rawSpells);
  await spellbook.update({ "system.spells": rawSpells });
}
