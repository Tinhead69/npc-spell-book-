export const MODULE_ID = "npc-spell-book";

export function getSpellbookSpells(spellbook) {
  return foundry.utils.getProperty(spellbook, `flags.${MODULE_ID}.spells`) || [];
}

/** @type {{ uuids: Set<string>, identifiers: Set<string>, names: Set<string> }|null} */
let _wizardMembershipCache = null;

/**
 * Resolve the unified Wizard class spell list from the dnd5e registry.
 * @returns {object|null}
 */
export function getWizardSpellList() {
  const registry = globalThis.dnd5e?.registry?.spellLists;
  if (!registry?.forType) return null;
  return registry.forType("class", "wizard") || registry.forType("class:wizard") || null;
}

/**
 * Build (and cache) Wizard spell membership sets from the dnd5e registry.
 * Matching is by UUID, spell identifier, or name so DDB/SRD copies of wizard spells still qualify.
 * @returns {{ uuids: Set<string>, identifiers: Set<string>, names: Set<string> }|null}
 */
export function getWizardSpellMembership() {
  if (_wizardMembershipCache) return _wizardMembershipCache;

  const list = getWizardSpellList();
  if (!list) return null;

  const uuids = new Set(list.uuids ?? []);
  const identifiers = new Set(list.identifiers ?? []);
  const names = new Set();

  for (const entry of list.indexes ?? []) {
    if (entry?.name) names.add(String(entry.name).toLowerCase().trim());
    const id = entry?.system?.identifier;
    if (id) identifiers.add(id);
  }

  // If indexes did not resolve, derive names from UUIDs directly.
  if (!names.size && uuids.size && typeof fromUuidSync === "function") {
    for (const uuid of uuids) {
      try {
        const doc = fromUuidSync(uuid);
        if (doc?.name) names.add(String(doc.name).toLowerCase().trim());
      } catch (_) { /* ignore unresolved */ }
    }
  }

  if (!uuids.size && !names.size && !identifiers.size) return null;

  _wizardMembershipCache = { uuids, identifiers, names };
  return _wizardMembershipCache;
}

/** Clear cached wizard list membership (e.g. after packs reload). */
export function clearWizardSpellMembershipCache() {
  _wizardMembershipCache = null;
}

/**
 * Is this spell on the Wizard spell list?
 * @param {Item|object|string} spell Item document, index entry, stored entry, or UUID
 * @returns {boolean}
 */
export function isWizardSpell(spell) {
  if (!spell) return false;

  if (typeof spell === "object") {
    const rawLevel = spell.level ?? spell.system?.level;
    if (rawLevel !== undefined && rawLevel !== null && rawLevel !== "") {
      const level = Number(rawLevel);
      if (!Number.isFinite(level) || level < 1 || level > 9) return false;
    }
  }

  const membership = getWizardSpellMembership();
  if (!membership) {
    if (!globalThis.__npcSpellbookWizardListWarned) {
      console.warn("NPC Spellbook | Wizard spell list unavailable; excluding spells until the dnd5e registry is ready.");
      globalThis.__npcSpellbookWizardListWarned = true;
    }
    return false;
  }

  const uuid = typeof spell === "string"
    ? spell
    : (spell.uuid || spell._stats?.compendiumSource || "");
  if (uuid && membership.uuids.has(uuid)) return true;

  if (typeof spell === "object") {
    const list = getWizardSpellList();
    if (list && typeof list.has === "function" && spell instanceof Item && list.has(spell)) return true;
  }

  const identifier = typeof spell === "object"
    ? (spell.system?.identifier || spell.identifier || "")
    : "";
  if (identifier && membership.identifiers.has(identifier)) return true;

  // Name match covers equivalent spells from DDB / other packs not listed by UUID.
  const name = typeof spell === "object" ? String(spell.name || "").toLowerCase().trim() : "";
  if (name && membership.names.has(name)) return true;

  return false;
}

/**
 * Build a compact, display-ready spell entry for the spellbook sheet.
 * Accepts either a full Item document / toObject() payload or a slim stored entry.
 */
export function formatSpellEntry(spell) {
  const system = spell?.system ?? {};
  const level = Number(spell?.level ?? system.level ?? 0);

  return {
    uuid: spell.uuid ?? spell._id ?? "",
    name: spell.name ?? "Unknown Spell",
    img: spell.img || "icons/svg/book.svg",
    level,
    castingTime: formatCastingTime(system),
    range: formatRange(system),
    duration: formatDuration(system),
    target: formatTarget(system),
    components: formatComponents(system)
  };
}

function formatCastingTime(system) {
  const act = system.activation ?? Object.values(system.activities ?? {})[0]?.activation;
  if (!act?.type) return "—";

  const type = String(act.type).toLowerCase();
  const value = Number(act.value ?? act.cost ?? 0);
  const labels = {
    action: "Action",
    bonus: "Bonus Action",
    reaction: "Reaction",
    minute: "minute",
    hour: "hour",
    day: "day",
    special: "Special",
    legendary: "Legendary",
    mythic: "Mythic",
    lair: "Lair"
  };
  const label = labels[type] || type;
  if (value > 1 && ["minute", "hour", "day"].includes(type)) return `${value} ${label}s`;
  if (value > 1) return `${value} ${label}`;
  return label;
}

function formatRange(system) {
  const rng = system.range ?? Object.values(system.activities ?? {})[0]?.range;
  if (!rng) return "—";

  const units = String(rng.units ?? "").toLowerCase();
  if (units === "self") return "self";
  if (units === "touch") return "touch";
  if (units === "spec" || units === "special") return "special";
  if (units === "any") return "any";
  if (rng.value != null && rng.value !== "" && units) return `${rng.value} ${units}`;
  if (units) return units;
  if (rng.value != null && rng.value !== "") return String(rng.value);
  return "—";
}

function formatDuration(system) {
  const dur = system.duration ?? Object.values(system.activities ?? {})[0]?.duration;
  if (!dur) return "—";

  const units = String(dur.units ?? "").toLowerCase();
  if (!units || units === "inst") return "instant";
  if (units === "perm") return "permanent";
  if (units === "spec" || units === "special") return "special";
  if (units === "disp") return "until dispelled";
  if (units === "conc") return "concentration";

  const value = Number(dur.value ?? 0);
  if (value > 0) {
    const plural = value === 1 ? units : `${units}s`;
    return `${value} ${plural}`;
  }
  return units || "—";
}

function formatTarget(system) {
  const tgt = system.target ?? Object.values(system.activities ?? {})[0]?.target;
  if (!tgt) return "—";

  if (tgt.affects?.type) {
    const count = tgt.affects.count || tgt.affects.value || "";
    const type = tgt.affects.type;
    return `${count} ${type}`.trim() || type;
  }

  if (tgt.type) {
    const value = tgt.value ?? "";
    return `${value} ${tgt.type}`.trim() || tgt.type;
  }

  if (tgt.template?.type) {
    const size = tgt.template.size ?? "";
    const units = tgt.template.units || "";
    return `${size}${units ? ` ${units}` : ""} ${tgt.template.type}`.trim();
  }

  return "—";
}

function formatComponents(system) {
  const parts = [];
  const props = system.properties;

  const has = (key) => {
    if (!props) return false;
    if (props instanceof Set) return props.has(key);
    if (Array.isArray(props)) return props.includes(key);
    if (typeof props === "object") return Boolean(props[key]);
    return false;
  };

  if (system.components) {
    if (system.components.vocal || system.components.v) parts.push("V");
    if (system.components.somatic || system.components.s) parts.push("S");
    if (system.components.material || system.components.m) parts.push("M");
  } else {
    if (has("vocal") || has("v")) parts.push("V");
    if (has("somatic") || has("s")) parts.push("S");
    if (has("material") || has("m")) parts.push("M");
  }

  if (has("concentration") || system.components?.concentration) parts.push("C");
  if (has("ritual") || system.components?.ritual) parts.push("R");

  return parts.length ? parts.join(", ") : "—";
}

/**
 * Slim serializable spell payload stored on the spellbook item.
 */
export function buildStoredSpellData(spellDoc) {
  const data = typeof spellDoc.toObject === "function"
    ? spellDoc.toObject()
    : foundry.utils.deepClone(spellDoc);

  return {
    uuid: spellDoc.uuid,
    name: spellDoc.name,
    img: spellDoc.img,
    level: spellDoc.system?.level ?? 0,
    system: {
      level: data.system?.level ?? 0,
      activation: data.system?.activation,
      duration: data.system?.duration,
      range: data.system?.range,
      target: data.system?.target,
      components: data.system?.components,
      properties: data.system?.properties instanceof Set
        ? Array.from(data.system.properties)
        : data.system?.properties,
      activities: data.system?.activities
    }
  };
}

export async function addSpellToSpellbook(spellbook, spellUuid) {
  if (!spellbook || !spellUuid) return;

  try {
    const spellDoc = await fromUuid(spellUuid);
    if (!spellDoc) {
      ui.notifications?.warn(`Could not find spell document for UUID: ${spellUuid}`);
      return;
    }

    if (!isWizardSpell(spellDoc)) {
      ui.notifications?.warn(`"${spellDoc.name}" is not on the Wizard spell list.`);
      return;
    }

    const spellData = buildStoredSpellData(spellDoc);
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
