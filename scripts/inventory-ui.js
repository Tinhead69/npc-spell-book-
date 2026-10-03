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

/**
 * Hide non-module controls under an expanded inventory spellbook row.
 * Covers dnd5e activity rows and Tidy/default summary command buttons.
 */
function hideForeignInventoryControls(row) {
  row.classList.add("npc-spellbook-inventory-item");

  // dnd5e activity rows (Attack / Damage / etc.)
  for (const el of row.querySelectorAll("[data-activity-id], .activities, ol.activities, .item-activities")) {
    el.hidden = true;
    el.style.setProperty("display", "none", "important");
  }

  // Any labeled action control under the expanded block that isn't ours.
  for (const el of row.querySelectorAll("button, a.button, [role='button']")) {
    if (el.closest("[data-npc-spellbook-actions]")) continue;
    if (el.matches("[data-npc-spellbook-action]")) continue;
    // Leave the main row chrome (expand chevron, context menu, qty) alone.
    if (!el.closest(".item-summary, [class*='summary'], [class*='expanded'], .activities, [data-activity-id]")) {
      continue;
    }

    const label = `${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.title || ""}`
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    if (!label) continue;
    if (label.includes("view spellbook") || /(^|\s)transcribe(\s|$)/.test(label)) continue;

    el.hidden = true;
    el.style.setProperty("display", "none", "important");
  }
}

/**
 * Inject View Spellbook + Transcribe for sheets that do not use Tidy commands
 * (stock dnd5e inventory expand).
 */
function injectDefaultSheetActions(row, item) {
  if (row.querySelector("[data-npc-spellbook-actions]")) return;

  // Tidy already renders our registered commands — avoid duplicates.
  if (row.closest(".tidy5e-sheet, .tidy5e")) {
    // Still ensure foreign controls are hidden.
    return;
  }

  const host = row.querySelector(".item-summary")
    || row.querySelector(".item-details")
    || row;

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
      ${canTranscribe ? "" : `disabled title="${onlyWizard}"`}>
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

  host.appendChild(wrap);
}

/**
 * After any actor sheet render, tidy spellbook inventory rows.
 * Also watches for expand/collapse (summary injected after the initial render).
 */
export function enhanceSpellbookInventoryRows(app, element) {
  const root = element instanceof HTMLElement
    ? element
    : (element?.[0] instanceof HTMLElement ? element[0] : null);
  const actor = app?.actor ?? app?.document;
  if (!root || !actor?.items) return;

  const apply = () => {
    for (const row of root.querySelectorAll("[data-item-id]")) {
      const itemId = row.dataset.itemId;
      if (!itemId) continue;
      const item = actor.items.get(itemId);
      if (!isNpcSpellbook(item)) continue;

      hideForeignInventoryControls(row);
      injectDefaultSheetActions(row, item);
    }
  };

  apply();

  if (root.dataset.npcSpellbookInvBound === "true") return;
  root.dataset.npcSpellbookInvBound = "true";

  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(apply, 40);
  };

  root.addEventListener("click", schedule);
  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true });
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

  // Disable built-in / other-module summary commands on NPC spellbooks.
  const commands = itemSummary.commands;
  if (Array.isArray(commands)) {
    for (const cmd of commands) {
      const label = typeof cmd.label === "function" ? "" : String(cmd.label ?? "");
      if (ourLabels.has(label) || label.startsWith("NPC_SPELLBOOK.")) continue;

      const previous = cmd.enabled;
      cmd.enabled = (params) => {
        if (isNpcSpellbook(params?.item)) return false;
        return typeof previous === "function" ? previous(params) : true;
      };
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
