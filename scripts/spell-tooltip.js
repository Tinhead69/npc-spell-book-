const TOOLTIP_DELAY_MS = 2000;
const TOOLTIP_ID = "npc-spellbook-spell-tooltip";

const descCache = new Map();

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

async function showSpellTooltip(row, state) {
  if (!row?.isConnected || state._tooltipRow !== row) return;

  const uuid = row.dataset.uuid;
  const title = row.querySelector(".spell-title")?.textContent?.trim() || "Spell";

  let bodyHtml = descCache.get(uuid);
  if (!bodyHtml) {
    try {
      const doc = await fromUuid(uuid);
      const raw = doc?.system?.description?.value
        || doc?.system?.description
        || "<em>No description available.</em>";
      const enricher = foundry.applications?.ux?.TextEditor?.implementation
        || globalThis.TextEditor;
      bodyHtml = enricher?.enrichHTML
        ? await enricher.enrichHTML(String(raw), { async: true, relativeTo: doc })
        : String(raw);
    } catch (err) {
      console.warn("NPC Spellbook | Failed to load spell description", uuid, err);
      bodyHtml = "<em>Could not load spell description.</em>";
    }
    descCache.set(uuid, bodyHtml);
  }

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
