const TOOLTIP_DELAY_MS = 2000;
const TOOLTIP_ID = "npc-spellbook-spell-tooltip";

const descCache = new Map();
/** @type {Map<string, string|null>} cacheKey -> enriched HTML (or null if none found) */
const fallbackDescCache = new Map();

/**
 * Attach 2s hover tooltips showing spell descriptions for `.spell-row[data-uuid]` rows.
 * Call once from `_onFirstRender`. Returns a disposer used on close.
 * @param {HTMLElement} root
 * @param {object} [state] Mutable host state (`_tooltipTimer`, `_tooltipRow`)
 * @returns {() => void}
 */
export function bindSpellDescriptionTooltips(root, state = {}) {
  if (!root || root.dataset.spellTooltipBound === "true") {
    return () => clearSpellTooltip(state, true);
  }
  root.dataset.spellTooltipBound = "true";

  const onOver = (event) => {
    const row = event.target.closest?.(".spell-row[data-uuid]");
    if (!row || !root.contains(row)) return;
    const from = event.relatedTarget;
    if (from && row.contains(from)) return;
    scheduleSpellTooltip(row, state);
  };

  const onOut = (event) => {
    const row = event.target.closest?.(".spell-row[data-uuid]");
    if (!row) return;
    const to = event.relatedTarget;
    if (to && row.contains(to)) return;
    clearSpellTooltip(state, true);
  };

  root.addEventListener("pointerover", onOver);
  root.addEventListener("pointerout", onOut);

  return () => {
    root.removeEventListener("pointerover", onOver);
    root.removeEventListener("pointerout", onOut);
    delete root.dataset.spellTooltipBound;
    clearSpellTooltip(state, true);
  };
}

export function clearSpellTooltip(state = {}, removeElement = true) {
  if (state._tooltipTimer) {
    clearTimeout(state._tooltipTimer);
    state._tooltipTimer = null;
  }
  state._tooltipRow = null;
  if (removeElement) document.getElementById(TOOLTIP_ID)?.remove();
}

function scheduleSpellTooltip(row, state) {
  clearSpellTooltip(state, false);
  state._tooltipRow = row;
  state._tooltipTimer = setTimeout(() => {
    showSpellTooltip(row, state);
  }, TOOLTIP_DELAY_MS);
}

/** Plain-text length / quality check for spell description HTML. */
function isUsefulDescription(html) {
  if (!html || typeof html !== "string") return false;
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 48) return false;
  // Automation stubs (CPR / GPS) — not real spell text.
  if (/^requires\b/i.test(text) && text.length < 120) return false;
  if (/no description available/i.test(text)) return false;
  return true;
}

function normalizeSpellName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s*\(\s*legacy\s*\)\s*$/i, "")
    .replace(/\s*\(\s*2024\s*\)\s*$/i, "")
    .trim();
}

function packPriority(pack) {
  const id = String(pack?.collection || "").toLowerCase();
  if (id === "dnd5e.spells" || id === "dnd5e.spells24") return 100;
  if (id.startsWith("dnd5e.")) return 80;
  if (id.includes("ddb") && id.includes("spell")) return 70;
  if (id.includes("spell")) return 40;
  return 10;
}

function getRawDescription(doc) {
  const desc = doc?.system?.description;
  if (typeof desc === "string") return desc.trim() ? desc : "";
  if (desc && typeof desc === "object") {
    const value = desc.value;
    if (typeof value === "string") return value;
  }
  return "";
}

/**
 * Find a richer description from another spell with the same identifier or name
 * (e.g. CPR automation stub → dnd5e / DDB entry filtered out of the picker).
 */
async function findFallbackDescription(doc) {
  if (!doc || !game?.packs) return null;

  const identifier = doc.system?.identifier || "";
  const nameKey = normalizeSpellName(doc.name);
  if (!identifier && !nameKey) return null;

  const cacheKey = `id:${identifier}|name:${nameKey}`;
  if (fallbackDescCache.has(cacheKey)) return fallbackDescCache.get(cacheKey);

  const level = Number(doc.system?.level ?? NaN);
  const packs = game.packs
    .filter((p) => (p.documentName || p.metadata?.type) === "Item")
    .sort((a, b) => packPriority(b) - packPriority(a));

  let bestRaw = null;
  let bestScore = -1;

  for (const pack of packs) {
    try {
      await pack.getIndex({ fields: ["type", "system.identifier", "system.level"] });
      const entries = pack.index?.contents
        ?? (typeof pack.index?.filter === "function" ? pack.index.filter(() => true) : Array.from(pack.index?.values?.() ?? []));

      for (const entry of entries) {
        if (entry?.type !== "spell") continue;
        const entryUuid = entry.uuid || `Compendium.${pack.collection}.Item.${entry._id}`;
        if (entryUuid === doc.uuid) continue;

        const entryId = entry.system?.identifier || entry["system.identifier"] || "";
        const entryName = normalizeSpellName(entry.name);
        const idMatch = identifier && entryId && entryId === identifier;
        const nameMatch = nameKey && entryName && entryName === nameKey;
        if (!idMatch && !nameMatch) continue;

        const entryLevel = Number(entry.system?.level ?? entry["system.level"] ?? NaN);
        if (Number.isFinite(level) && Number.isFinite(entryLevel) && entryLevel !== level) continue;

        const other = await fromUuid(entryUuid);
        const raw = getRawDescription(other);
        if (!isUsefulDescription(raw)) continue;

        const score = packPriority(pack) + Math.min(String(raw).length, 2000) / 2000;
        if (score > bestScore) {
          bestScore = score;
          bestRaw = raw;
        }

        // Good enough match from an official / DDB pack — stop early.
        if (packPriority(pack) >= 70 && bestRaw) {
          fallbackDescCache.set(cacheKey, bestRaw);
          return bestRaw;
        }
      }
    } catch (_) {
      /* skip unreadable packs */
    }
  }

  fallbackDescCache.set(cacheKey, bestRaw);
  return bestRaw;
}

async function enrichDescription(raw, relativeTo) {
  const text = typeof raw === "string"
    ? raw
    : (typeof raw?.value === "string" ? raw.value : "");
  if (!text.trim()) return "<em>No description available.</em>";

  const enricher = foundry.applications?.ux?.TextEditor?.implementation
    || globalThis.TextEditor;
  let result = text;
  if (enricher?.enrichHTML) {
    result = await enricher.enrichHTML(text, { async: true, relativeTo });
  }

  // Foundry sometimes returns an element/fragment instead of a string.
  if (typeof result === "string") return result;
  if (result instanceof HTMLElement) return result.innerHTML;
  if (typeof result?.innerHTML === "string") return result.innerHTML;
  if (typeof result?.content === "string") return result.content;
  return text;
}

async function loadSpellDescriptionHtml(uuid) {
  if (descCache.has(uuid)) {
    const cached = descCache.get(uuid);
    // Drop bad cache entries from earlier builds that stringified description objects.
    if (typeof cached === "string" && !cached.includes("[object Object]")) return cached;
    descCache.delete(uuid);
  }

  let bodyHtml = "<em>No description available.</em>";
  try {
    const doc = await fromUuid(uuid);
    let raw = getRawDescription(doc);

    if (!isUsefulDescription(raw)) {
      const fallback = await findFallbackDescription(doc);
      if (typeof fallback === "string" && fallback.trim()) raw = fallback;
    }

    if (typeof raw === "string" && raw.trim()) {
      bodyHtml = await enrichDescription(raw, doc);
    }
    if (typeof bodyHtml !== "string" || bodyHtml.includes("[object Object]")) {
      bodyHtml = "<em>No description available.</em>";
    }
  } catch (err) {
    console.warn("NPC Spellbook | Failed to load spell description", uuid, err);
    bodyHtml = "<em>Could not load spell description.</em>";
  }

  descCache.set(uuid, bodyHtml);
  return bodyHtml;
}

async function showSpellTooltip(row, state) {
  if (!row?.isConnected || state._tooltipRow !== row) return;

  const uuid = row.dataset.uuid;
  const title = row.querySelector(".spell-title")?.textContent?.trim() || "Spell";
  const bodyHtml = await loadSpellDescriptionHtml(uuid);

  if (state._tooltipRow !== row || !row.isConnected) return;

  let tip = document.getElementById(TOOLTIP_ID);
  if (!tip) {
    tip = document.createElement("div");
    tip.id = TOOLTIP_ID;
    tip.className = "npc-spellbook-tooltip";
    document.body.appendChild(tip);
  }

  const safeTitle = foundry.utils.escapeHTML?.(title)
    || title.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));

  tip.innerHTML = `
    <header class="npc-spellbook-tooltip-header">${safeTitle}</header>
    <div class="npc-spellbook-tooltip-body">${bodyHtml}</div>
  `;

  const rect = row.getBoundingClientRect();
  const tipWidth = 380;
  const left = Math.max(8, Math.min(rect.left + 24, window.innerWidth - tipWidth - 8));
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(8, rect.bottom + 6)}px`;
  tip.style.display = "block";

  requestAnimationFrame(() => {
    const tipRect = tip.getBoundingClientRect();
    if (tipRect.bottom > window.innerHeight - 8) {
      tip.style.top = `${Math.max(8, rect.top - tipRect.height - 6)}px`;
    }
  });
}
