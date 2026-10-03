import { MODULE_ID, getSpellbookSpells, isWizardSpell } from "./data.js";

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

/**
 * @param {Actor} actor
 * @returns {number}
 */
export function getGold(actor) {
  return Number(actor.system?.currency?.gp ?? actor.system?.details?.currency?.gp ?? 0);
}

/**
 * @param {Actor} actor
 * @param {number} amount
 * @returns {Promise<void>}
 */
export async function deductGold(actor, amount) {
  if (amount <= 0) return;
  const current = getGold(actor);
  const gp = Math.max(0, current - amount);
  if ("currency" in (actor.system ?? {})) {
    await actor.update({ "system.currency.gp": gp });
  } else if (actor.system?.details?.currency) {
    await actor.update({ "system.details.currency.gp": gp });
  }
}

export { isWizardSpell };

/**
 * Does this actor already have this spell in their dnd5e spell list?
 * @param {Actor} actor
 * @param {object} spellEntry
 * @returns {boolean}
 */
export function actorKnowsSpell(actor, spellEntry) {
  if (!actor?.items) return false;
  const targetName = (spellEntry.name ?? "").toLowerCase();
  const targetUuid = spellEntry.uuid ?? "";

  return actor.items.some((item) => {
    if (item.type !== "spell") return false;
    if (item.name?.toLowerCase() === targetName) return true;

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
  const spellLevel = Number(spellEntry.level ?? 0);
  const cost = getTranscriptionCost(spellLevel);

  if (!isWizard(wizard)) {
    return { canLearn: false, reasonKey: "Not a Wizard" };
  }

  if (!isWizardSpell(spellEntry)) {
    return { canLearn: false, reasonKey: "Not on the Wizard spell list" };
  }

  if (spellLevel < 1) {
    return { canLearn: false, reasonKey: "Cantrips cannot be transcribed" };
  }

  if (spellLevel > maxLevel) {
    return { canLearn: false, reasonKey: `Spell level too high (Max: Lvl ${maxLevel})` };
  }

  if (actorKnowsSpell(wizard, spellEntry)) {
    return { canLearn: false, reasonKey: "Already in spellbook" };
  }

  const known = getTranscribedSpells(wizard);
  if (known.some((s) => s.uuid === spellEntry.uuid || s.name === spellEntry.name)) {
    return { canLearn: false, reasonKey: "Already in spellbook" };
  }

  if (requireGold && checkAfford && cost > 0) {
    const gold = getGold(wizard);
    if (gold < cost) {
      return { canLearn: false, reasonKey: `Cannot afford (${cost} GP needed)` };
    }
  }

  return { canLearn: true, reasonKey: "Learnable" };
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

/**
 * Opens an interactive dialog to pick a Wizard actor and transcribe individual spells.
 * @param {Item} sourceSpellbook
 */
export async function openTranscribeDialog(sourceSpellbook) {
  const spells = getSpellbookSpells(sourceSpellbook);
  if (!spells.length) {
    ui.notifications?.warn("There are no spells in this spellbook to transcribe.");
    return;
  }

  const wizardActors = game.actors.filter((actor) => isWizard(actor));
  if (!wizardActors.length) {
    ui.notifications?.warn("No Wizard actors found in this world.");
    return;
  }

  let selectedWizard = wizardActors[0];

  const renderSpellList = (wizard, rootEl) => {
    const listContainer = rootEl.querySelector(".transcribe-spell-list");
    if (!listContainer) return;

    const goldDisplay = rootEl.querySelector(".wizard-gold-display");
    if (goldDisplay) goldDisplay.textContent = `${getGold(wizard)} GP`;

    if (!spells.length) {
      listContainer.innerHTML = `<div style="padding: 10px; text-align: center; color: #888;">No spells in this spellbook.</div>`;
      return;
    }

    const rowsHtml = spells.map((spell) => {
      const level = Number(spell.level ?? 0);
      const evalResult = evaluateTranscription(wizard, spell, { requireGold: true, checkAfford: true });
      const cost = getTranscriptionCost(level);
      const hours = getTranscriptionHours(level);

      let actionHtml = "";

      if (evalResult.reasonKey === "Already in spellbook" || actorKnowsSpell(wizard, spell)) {
        actionHtml = `<span style="color: #888; font-style: italic; font-size: 0.8rem;"><i class="fas fa-check-circle" style="color: #4a7c4a;"></i> Already in spellbook</span>`;
      } else if (!evalResult.canLearn) {
        actionHtml = `<span style="color: #aa4444; font-size: 0.8rem;" title="${evalResult.reasonKey}"><i class="fas fa-times-circle"></i> ${evalResult.reasonKey}</span>`;
      } else {
        actionHtml = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 0.75rem; color: #bbb;">${cost} GP &bull; ${hours} hrs</span>
            <button type="button" class="btn-transcribe-single" data-uuid="${spell.uuid}" style="padding: 3px 8px; font-size: 0.75rem; background: #2b3a4c; color: #fff; border: 1px solid #4a5d7c; border-radius: 3px; cursor: pointer;">
              <i class="fas fa-scroll"></i> Transcribe
            </button>
          </div>
        `;
      }

      return `
        <div class="spell-row" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-bottom: 1px solid #222; background: #141414;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${spell.img || "icons/svg/book.svg"}" width="24" height="24" style="border: none; border-radius: 3px;" />
            <span style="font-size: 0.85rem; font-weight: 500; color: #eee;">${spell.name}</span>
            <span style="font-size: 0.75rem; color: #888;">(Lvl ${level})</span>
          </div>
          <div>${actionHtml}</div>
        </div>
      `;
    }).join("");

    listContainer.innerHTML = rowsHtml;

    // Attach click listeners to individual Transcribe buttons
    listContainer.querySelectorAll(".btn-transcribe-single").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const uuid = btn.dataset.uuid;
        const spellEntry = spells.find((s) => s.uuid === uuid);
        if (!spellEntry) return;

        btn.disabled = true;
        btn.textContent = "Transcribing...";

        const success = await transcribeSpell(wizard, spellEntry, sourceSpellbook, {
          deductGold: true,
          requireGold: true
        });

        if (success) {
          ui.notifications?.info(`Transcribed "${spellEntry.name}" to ${wizard.name}.`);
        }

        // Refresh rows to reflect new state & deducted gold
        renderSpellList(wizard, rootEl);
      });
    });
  };

  const optionsHtml = wizardActors
    .map((a) => `<option value="${a.uuid}">${a.name}</option>`)
    .join("");

  const content = `
    <div class="transcribe-dialog-box" style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #222; padding: 8px; border-radius: 4px;">
        <label style="font-weight: bold; font-size: 0.85rem; flex-shrink: 0; color: #ccc;">Target Wizard:</label>
        <select name="wizardSelect" style="flex: 1; padding: 4px; background: #111; color: #fff; border: 1px solid #444; border-radius: 3px;">
          ${optionsHtml}
        </select>
        <span class="wizard-gold-display" style="font-weight: bold; font-size: 0.85rem; color: #d1b87a; flex-shrink: 0;">
          ${getGold(selectedWizard)} GP
        </span>
      </div>

      <div class="transcribe-spell-list" style="max-height: 320px; min-height: 150px; overflow-y: auto; border: 1px solid #333; border-radius: 4px; background: #111;">
      </div>
    </div>
  `;

  new Dialog({
    title: `Transcribe Spells — ${sourceSpellbook.name}`,
    content: content,
    buttons: {
      close: {
        icon: '<i class="fas fa-times"></i>',
        label: "Close"
      }
    },
    default: "close",
    render: (html) => {
      const rootEl = html instanceof HTMLElement ? html : html[0];

      // Initial list render
      renderSpellList(selectedWizard, rootEl);

      // Handle dropdown switch
      const select = rootEl.querySelector('[name="wizardSelect"]');
      if (select) {
        select.addEventListener("change", async (e) => {
          const wizardActor = await fromUuid(e.target.value);
          if (wizardActor) {
            selectedWizard = wizardActor;
            renderSpellList(selectedWizard, rootEl);
          }
        });
      }
    }
  }, { width: 500, height: "auto" }).render(true);
}
