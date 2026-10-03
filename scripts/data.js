export const MODULE_ID = "npc-spell-book";
export const SPELLBOOK_ICON = "icons/svg/book.svg";

/**
 * Checks if an item document is marked as a spellbook.
 */
export function isSpellbook(item) {
  return item?.type === "spellbook" || Boolean(item?.flags?.[MODULE_ID]?.isSpellbook);
}

/**
 * Marks an item as a spellbook.
 */
export async function markAsSpellbook(item) {
  await item.setFlag(MODULE_ID, "isSpellbook", true);
}

/**
 * Gets document or element entry ID safely.
 */
export function getEntryId(doc) {
  return doc?._id || doc?.id || doc?.dataset?.entryId || foundry.utils.randomID();
}

/**
 * Retrieves stored spells array from item flags.
 */
export function getSpellbookSpells(spellbook) {
  return foundry.utils.getProperty(spellbook, `flags.${MODULE_ID}.spells`) || [];
}

/**
 * Adds a spell document or UUID to the spellbook item's flags.
 */
export async function addSpellToSpellbook(spellbook, spellInput) {
  if (!spellbook || !spellInput) return;

  try {
    let spellData;
    let uuid;

    if (typeof spellInput === "string") {
      uuid = spellInput;
      const spellDoc = await fromUuid(spellInput);
      if (!spellDoc) return;
      spellData = typeof spellDoc.toObject === "function" ? spellDoc.toObject() : JSON.parse(JSON.stringify(spellDoc));
    } else if (typeof spellInput === "object") {
      uuid = spellInput.uuid || spellInput._id;
      spellData = typeof spellInput.toObject === "function" ? spellInput.toObject() : JSON.parse(JSON.stringify(spellInput));
    }

    if (!spellData) return;
    spellData.uuid = uuid;

    const existingSpells = foundry.utils.deepClone(getSpellbookSpells(spellbook));
    const alreadyInBook = existingSpells.some(s => s.uuid === uuid || (s._id && s._id === spellData._id));

    if (!alreadyInBook) {
      existingSpells.push(spellData);
      await spellbook.setFlag(MODULE_ID, "spells", existingSpells);
    }
  } catch (err) {
    console.error("NPC Spell Book | Failed to add spell:", err);
  }
}

/**
 * Removes a spell by UUID from the spellbook.
 */
export async function removeSpellFromSpellbook(spellbook, spellUuid) {
  if (!spellbook || !spellUuid) return;
  const existingSpells = foundry.utils.deepClone(getSpellbookSpells(spellbook));
  const updated = existingSpells.filter(s => s.uuid !== spellUuid && s._id !== spellUuid && s.id !== spellUuid);
  await spellbook.setFlag(MODULE_ID, "spells", updated);
}
