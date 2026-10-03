import { MODULE_ID } from "./data.js";
import { isWizard } from "./mechanics.js";
import { openTranscribeDialog } from "./transcribe-dialog.js";
import { getSpellbookSheetClass } from "./spellbook-sheet.js";

function isNpcSpellbook(item) {
  return Boolean(item?.getFlag?.(MODULE_ID, "isSpellbook"));
}

function getOwnerActor(item) {
  const owner = item?.actor;
  if (!owner) return null;
  return (owner.id && game.actors?.get?.(owner.id)) || owner;
}

function canOwnerTranscribe(item) {
  const owner = getOwnerActor(item);
  if (!owner) return true;
  return isWizard(owner);
}

function openSpellbookSheet(item) {
  if (!item || !isNpcSpellbook(item)) return;
  try {
    if (item.sheet) {
      item.sheet.render(true);
      return;
    }
  } catch (err) {
    console.warn("NPC Spellbook | item.sheet.render failed, falling back", err);
  }
  const SpellbookSheet = getSpellbookSheetClass();
  new SpellbookSheet({ document: item }).render({ force: true });
}

function tryTranscribe(item) {
  if (!item || !isNpcSpellbook(item)) return;
  if (!canOwnerTranscribe(item)) {
    ui.notifications?.warn(
      game.i18n.localize("NPC_SPELLBOOK.Actions.OnlyWizardMayTranscribe")
      || "Only a Wizard May transcribe spells"
    );
    return;
  }
  openTranscribeDialog(item);
}

function localize(key, fallback) {
  const value = game.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

function isTidySheet(root) {
  return Boolean(root?.closest?.(".tidy5e-sheet, .tidy5e") || root?.classList?.contains?.("tidy5e-sheet"));
}

/**
 * Find the expanded summary panel for a row (only present when expanded).
 * Never treat the whole row as the summary — that broke titles/expand on Tidy.
 */
function getExpandedSummary(row) {
  return row.querySelector(":scope > .item-summary")
    || row.querySelector(":scope > .item-detail")
    || row.querySelector(":scope .item-summary")
    || null;
}

/**
 * Inside an expanded summary only: hide activity rows and foreign action buttons.
 */
function sanitizeExpandedSummary(summary) {
  if (!summary || summary.dataset.npcSpellbookSanitized === "1") return;
  summary.dataset.npcSpellbookSanitized = "1";
  summary.classList.add("npc-spellbook-item-summary");

  for (const el of summary.querySelectorAll("[data-activity-id], ol.activities, .activities")) {
    el.hidden = true;
  }

  for (const el of summary.querySelectorAll("button, a.button")) {
    if (el.closest("[data-npc-spellbook-actions]")) continue;
    if (el.matches("[data-npc-spellbook-action]")) continue;

    const label = `${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.title || ""}`
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    if (!label) continue;
    if (label.includes("view spellbook") || /(^|\s)transcribe(\s|$)/.test(label)) continue;

    // Only hide known clutter actions — never generic unlabeled chrome.
    if (/display in chat|show chat information|show chat|attack|damage/.test(label)) {
      el.hidden = true;
    }
  }
}

/**
 * Default dnd5e sheet: inject our two actions into the expanded `.item-summary`.
 */
function injectDefaultSheetActions(summary, item) {
  if (!summary || summary.querySelector("[data-npc-spellbook-actions]")) return;

  const wrap = document.createElement("div");
  wrap.className = "npc-spellbook-inventory-actions";
  wrap.dataset.npcSpellbookActions = "1";

  const viewLabel = localize("NPC_SPELLBOOK.Actions.ViewSpellbook", "View Spellbook");
  const transcribeLabel = localize("NPC_SPELLBOOK.Actions.Transcribe", "Transcribe");
  const onlyWizard = localize(
    "NPC_SPELLBOOK.Actions.OnlyWizardMayTranscribe",
    "Only a Wizard May transcribe spells"
  );
  const canTranscribe = canOwnerTranscribe(item);

  wrap.innerHTML = `
    <button type="button" class="npc-spellbook-inv-btn" data-npc-spellbook-action="view">
      <i class="fas fa-book-open"></i> ${viewLabel}
    </button>
    <button type="button" class="npc-spellbook-inv-btn" data-npc-spellbook-action="transcribe"
      ${canTranscribe ? "" : `disabled title="${onlyWizard.replace(/"/g, "&quot;")}"`}>
      <i class="fas fa-scroll"></i> ${transcribeLabel}
    </button>
  `;

  wrap.addEventListener("click", (event) => {
    const btn = event.target.closest?.("[data-npc-spellbook-action]");
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    const action = btn.dataset.npcSpellbookAction;
    if (action === "view") openSpellbookSheet(item);
    else if (action === "transcribe") tryTranscribe(item);
  });

  summary.appendChild(wrap);
}

/**
 * Process one inventory row only if it is currently expanded.
 */
function enhanceExpandedSpellbookRow(row, item, { isTidy }) {
  const summary = getExpandedSummary(row);
  if (!summary) return;

  sanitizeExpandedSummary(summary);
  if (!isTidy) injectDefaultSheetActions(summary, item);
}

/**
 * After actor sheet render: only touch expanded spellbook summaries.
 * No MutationObserver / no collapsed-row edits (those blanked titles on Tidy).
 */
export function enhanceSpellbookInventoryRows(app, element) {
  const root = element instanceof HTMLElement
    ? element
    : (element?.[0] instanceof HTMLElement ? element[0] : null);
  const actor = app?.actor ?? app?.document;
  if (!root || !actor?.items) return;

  const tidy = isTidySheet(root);

  const apply = () => {
    for (const row of root.querySelectorAll("[data-item-id]")) {
      const item = actor.items.get(row.dataset.itemId);
      if (!isNpcSpellbook(item)) continue;
      enhanceExpandedSpellbookRow(row, item, { isTidy: tidy });
    }
  };

  apply();

  // When a row expands, dnd5e/Tidy inject summary HTML — re-run only for that.
  if (root.dataset.npcSpellbookInvBound === "true") return;
  root.dataset.npcSpellbookInvBound = "true";

  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(apply, 75);
  };

  // Expand toggles often go through click on the row header — safe, no DOM writes on collapse.
  root.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-item-id]")) schedule();
  }, true);
}

/**
 * Tidy 5e: register View Spellbook + Transcribe; hide other summary commands for spellbooks.
 */
export function registerTidyInventoryCommands(api) {
  const itemSummary = api?.config?.itemSummary || api?.itemSummary;
  if (typeof itemSummary?.registerCommands !== "function") return false;

  const ourLabels = new Set([
    "NPC_SPELLBOOK.Actions.ViewSpellbook",
    "NPC_SPELLBOOK.Actions.Transcribe",
    localize("NPC_SPELLBOOK.Actions.ViewSpellbook", "View Spellbook"),
    localize("NPC_SPELLBOOK.Actions.Transcribe", "Transcribe")
  ]);

  itemSummary.registerCommands([
    {
      label: "NPC_SPELLBOOK.Actions.ViewSpellbook",
      iconClass: "fas fa-book-open",
      tooltip: "NPC_SPELLBOOK.Actions.ViewSpellbook",
      enabled: (params) => isNpcSpellbook(params?.item),
      execute: (params) => openSpellbookSheet(params?.item)
    },
    {
      label: "NPC_SPELLBOOK.Actions.Transcribe",
      iconClass: "fas fa-scroll",
      tooltip: "NPC_SPELLBOOK.Actions.Transcribe",
      enabled: (params) => isNpcSpellbook(params?.item),
      execute: (params) => tryTranscribe(params?.item)
    }
  ]);

  // Soft-disable other registered summary commands on NPC spellbooks only.
  const commands = itemSummary.commands;
  if (Array.isArray(commands)) {
    for (const cmd of commands) {
      const label = typeof cmd.label === "function" ? "" : String(cmd.label ?? "");
      if (ourLabels.has(label) || label.startsWith("NPC_SPELLBOOK.")) continue;
      if (cmd._npcSpellbookWrapped) continue;

      const previous = cmd.enabled;
      cmd.enabled = (params) => {
        try {
          if (isNpcSpellbook(params?.item)) return false;
          return typeof previous === "function" ? previous(params) : true;
        } catch (_) {
          return typeof previous === "function" ? previous(params) : true;
        }
      };
      cmd._npcSpellbookWrapped = true;
    }
  }

  return true;
}

/** Stock dnd5e context menu entries. */
export function registerDnd5eSpellbookContextOptions(item, options) {
  if (!isNpcSpellbook(item) || !Array.isArray(options)) return;

  const hasView = options.some((o) =>
    String(o?.name || "").includes("ViewSpellbook") || String(o?.name || "").includes("View Spellbook")
  );
  if (!hasView) {
    options.unshift({
      name: "NPC_SPELLBOOK.Actions.ViewSpellbook",
      icon: '<i class="fas fa-book-open"></i>',
      group: "npc-spell-book",
      callback: () => openSpellbookSheet(item)
    });
  }

  const hasTranscribe = options.some((o) =>
    String(o?.name || "").includes("Transcribe")
  );
  if (!hasTranscribe) {
    options.unshift({
      name: "NPC_SPELLBOOK.Actions.Transcribe",
      icon: '<i class="fas fa-scroll"></i>',
      group: "npc-spell-book",
      callback: () => tryTranscribe(item)
    });
  }
}

export { openSpellbookSheet, tryTranscribe, isNpcSpellbook };
