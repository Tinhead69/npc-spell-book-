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

  const { DialogV2 } = foundry.applications.api;

  await DialogV2.prompt({
    window: { title: `Transcribe Spells — ${sourceSpellbook.name}` },
    content: content,
    ok: { label: "Close", icon: "fas fa-times" },
    rejectClose: false,
    render: (event) => {
      const rootEl = event.target.element;
      renderSpellList(selectedWizard, rootEl);

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
  });
}
