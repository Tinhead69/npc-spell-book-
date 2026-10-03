export const MODULE_ID = "npc-spell-book";

export function getSpellbookSpells(spellbook) {
  return foundry.utils.getProperty(spellbook, `flags.${MODULE_ID}.spells`) || [];
}

export async function addSpellToSpellbook(spellbook, spellUuid) {
  if (!spellbook || !spellUuid) return;

  try {
    const spellDoc = await fromUuid(spellUuid);
    if (!spellDoc) {
      ui.notifications?.warn(`Could not find spell document for UUID: ${spellUuid}`);
      return;
    }

    // Extract pure, serializable plain object data safely
    let spellData;
    if (typeof spellDoc.toObject === "function") {
      spellData = spellDoc.toObject();
    } else {
      spellData = JSON.parse(JSON.stringify(spellDoc));
    }

    // Retain original UUID for state tracking
    spellData.uuid = spellUuid;

    const existingSpells = foundry.utils.deepClone(getSpellbookSpells(spellbook));

    // Prevent duplicate additions
    const alreadyInBook = existingSpells.some(
      (s) => s.uuid === spellUuid || (s._id && s._id === spellDoc._id)
    );

    if (!alreadyInBook) {
      existingSpells.push(spellData);
      await spellbook.setFlag(MODULE_ID, "spells", existingSpells);
    }
  } catch (err) {
    console.error("NPC Spell Book | Failed to add spell:", err);
    ui.notifications?.error("Failed to add spell to spellbook. Check console for details.");
  }
}

export async function removeSpellFromSpellbook(spellbook, spellUuid) {
  if (!spellbook || !spellUuid) return;
  const existingSpells = foundry.utils.deepClone(getSpellbookSpells(spellbook));
  const updated = existingSpells.filter((s) => s.uuid !== spellUuid && s._id !== spellUuid);
  await spellbook.setFlag(MODULE_ID, "spells", updated);
}
