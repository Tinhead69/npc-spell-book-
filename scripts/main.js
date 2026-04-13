const MODULE_ID = "npc-spell-book";
const SPELLBOOK_ICON = "icons/svg/book.svg";
const FALLBACK_SPELL_ICON = "icons/svg/book.svg";

function log(...args) {
  console.log("NPC Spellbook |", ...args);
}

function warn(...args) {
  console.warn("NPC Spellbook |", ...args);
}

function getRulesVersion() {
  try {
    if (game.settings?.settings?.has("dnd5e.rulesVersion")) {
      return game.settings.get("dnd5e", "rulesVersion") ?? "legacy";
    }
    return "legacy";
  } catch (err) {
    warn("Could not read dnd5e rules version setting", err);
    return "legacy";
  }
}

function getWizardLevel(actor) {
  try {
    const actorClasses = actor?.classes ?? actor?.system?.classes ?? {};
    const wizard = actorClasses?.wizard;
    return Number(wizard?.system?.levels ?? wizard?.levels ?? 0);
  } catch (err) {
    warn(`Could not determine wizard level for ${actor?.name ?? "unknown actor"}`, err);
    return 0;
  }
}

function getSpellbookItemName(actor) {
  return `Spell book of ${actor.name}`;
}

function isSpellbookItem(item) {
  return item?.getFlag?.(MODULE_ID, "spellbook") === true;
}

function isSpellbookSpell(item, spellbookId) {
  return (
    item?.type === "spell" &&
    item?.getFlag?.(MODULE_ID, "spellCopy") === true &&
    item?.system?.container === spellbookId
  );
}

function getWizardSpellsFromActor(actor) {
  const actorItems = actor?.items?.contents ?? actor?.items ?? [];
  const wizardLevel = getWizardLevel(actor);

  const spells = actorItems.filter((item) => {
    if (item.type !== "spell") return false;

    // Ignore copied spellbook entries
    if (item.getFlag?.(MODULE_ID, "spellCopy") === true) return false;

    const preparationMode =
      item.system?.preparation?.mode ??
      item.system?.preparationMode ??
      "";

    const sourceClass =
      item.system?.source?.class ??
      item.system?.sourceClass ??
      item.system?.chatFlavor ??
      "";

    const sourceText = String(sourceClass).toLowerCase();
    const looksWizardish = sourceText.includes("wizard");

    if (looksWizardish) return true;

    if (wizardLevel > 0) {
      return ["prepared", "always", "innate", "atwill", "pact"].includes(preparationMode);
    }

    return false;
  });

  return spells.sort((a, b) => {
    const aLevel = Number(a.system?.level ?? 0);
    const bLevel = Number(b.system?.level ?? 0);
    if (aLevel !== bLevel) return aLevel - bLevel;
    return a.name.localeCompare(b.name);
  });
}

function buildSpellbookHtml(actor, spells, wizardLevel, rulesVersion) {
  const grouped = new Map();

  for (const spell of spells) {
    const level = Number(spell.system?.level ?? spell.level ?? 0);
    if (!grouped.has(level)) grouped.set(level, []);
    grouped.get(level).push(spell);
  }

  const sections = [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, entries]) => {
      const heading = level === 0 ? "Cantrips" : `Level ${level}`;
      const list = entries
        .map((spell) => {
          const school = spell.system?.school ?? spell.school ?? "";
          const schoolText = school ? ` <em>(${school})</em>` : "";
          return `<li><strong>${spell.name}</strong>${schoolText}</li>`;
        })
        .join("");

      return `
        <section style="margin-bottom: 0.75em;">
          <h3 style="margin: 0 0 0.25em 0;">${heading}</h3>
          <ul style="margin: 0 0 0 1.25em; padding: 0;">${list}</ul>
        </section>
      `;
    })
    .join("");

  return `
    <div class="npc-spell-book">
      <h1 style="margin-bottom: 0.5em;">NPC Spellbook</h1>
      <p><strong>Owner:</strong> ${actor.name}</p>
      <p><strong>Rules version:</strong> ${rulesVersion}</p>
      <p><strong>Wizard level:</strong> ${wizardLevel}</p>
      <p><strong>Stored spells:</strong> ${spells.length}</p>
      <hr />
      ${sections || "<p><em>No spells stored.</em></p>"}
    </div>
  `.trim();
}

async function applySpellbookFlags(item, actor, wizardLevel, rulesVersion, spellCount) {
  await item.setFlag(MODULE_ID, "spellbook", true);
  await item.setFlag(MODULE_ID, "ownerActorId", actor.id);
  await item.setFlag(MODULE_ID, "wizardLevel", wizardLevel);
  await item.setFlag(MODULE_ID, "rulesVersion", rulesVersion);
  await item.setFlag(MODULE_ID, "storedSpellCount", spellCount);
  await item.setFlag(MODULE_ID, "syncedAt", new Date().toISOString());
}

async function ensureSpellbookItem(actor, wizardSpells, wizardLevel) {
  const itemName = getSpellbookItemName(actor);
  const rulesVersion = getRulesVersion();

  let spellbookItem = actor.items.find((item) => isSpellbookItem(item));
  if (!spellbookItem) {
    spellbookItem = actor.items.find((item) => item.name === itemName);
  }

  const html = buildSpellbookHtml(actor, wizardSpells, wizardLevel, rulesVersion);

  if (spellbookItem) {
    await spellbookItem.update({
      name: itemName,
      img: SPELLBOOK_ICON,
      system: {
        ...(spellbookItem.system ?? {}),
        description: {
          ...(spellbookItem.system?.description ?? {}),
          value: html
        }
      }
    });

    await applySpellbookFlags(
      spellbookItem,
      actor,
      wizardLevel,
      rulesVersion,
      wizardSpells.length
    );

    return { item: spellbookItem, created: false };
  }

  const created = await actor.createEmbeddedDocuments("Item", [{
    name: itemName,
    type: "container",
    img: SPELLBOOK_ICON,
    system: {
      description: {
        value: html
      }
    }
  }]);

  const createdItem = created?.[0];
  if (!createdItem) {
    throw new Error(`Failed to create spellbook item for ${actor.name}.`);
  }

  await applySpellbookFlags(
    createdItem,
    actor,
    wizardLevel,
    rulesVersion,
    wizardSpells.length
  );

  return { item: createdItem, created: true };
}

function buildSpellCopyData(sourceSpell, spellbookId) {
  const data = sourceSpell.toObject();

  delete data._id;
  delete data.id;
  delete data.folder;
  delete data.sort;
  delete data.ownership;
  delete data.flags?.core?.sourceId;

  data.img = data.img || FALLBACK_SPELL_ICON;

  data.system = data.system ?? {};
  data.system.container = spellbookId;

  data.flags = data.flags ?? {};
  data.flags[MODULE_ID] = {
    ...(data.flags[MODULE_ID] ?? {}),
    spellCopy: true,
    sourceSpellId: sourceSpell.id,
    sourceSpellUuid: sourceSpell.uuid
  };

  return data;
}

async function syncSpellsIntoSpellbook(actor, spellbookItem, wizardSpells) {
  const actorItems = actor.items.contents ?? [];
  const existingCopies = actorItems.filter((item) => isSpellbookSpell(item, spellbookItem.id));

  const existingBySourceId = new Map(
    existingCopies.map((item) => [item.getFlag(MODULE_ID, "sourceSpellId"), item])
  );

  const sourceIds = new Set(wizardSpells.map((spell) => spell.id));

  let added = 0;
  let updated = 0;
  let removed = 0;

  for (const sourceSpell of wizardSpells) {
    const existingCopy = existingBySourceId.get(sourceSpell.id);
    const copyData = buildSpellCopyData(sourceSpell, spellbookItem.id);

    if (existingCopy) {
      await existingCopy.update(copyData);
      updated += 1;
    } else {
      await actor.createEmbeddedDocuments("Item", [copyData]);
      added += 1;
    }
  }

  const staleCopies = existingCopies.filter((item) => {
    const sourceSpellId = item.getFlag(MODULE_ID, "sourceSpellId");
    return !sourceIds.has(sourceSpellId);
  });

  if (staleCopies.length) {
    await actor.deleteEmbeddedDocuments(
      "Item",
      staleCopies.map((item) => item.id)
    );
    removed = staleCopies.length;
  }

  return { added, updated, removed };
}

async function createSummaryChatMessage({
  actor,
  createdSpellbook,
  wizardSpells,
  wizardLevel,
  rulesVersion,
  added,
  updated,
  removed
}) {
  const content = `
    <div class="npc-spellbook-summary">
      <h1 style="margin:0 0 0.5em 0;">NPC Spellbook</h1>
      <h3 style="margin:0 0 0.5em 0;">${actor.name}</h3>
      <ul style="margin:0; padding-left:1.25em;">
        <li>${createdSpellbook ? "Created spellbook." : "Updated spellbook."}</li>
        <li>Rules version: ${rulesVersion}.</li>
        <li>Wizard level: ${wizardLevel}.</li>
        <li>Spells stored: ${wizardSpells.length}.</li>
        <li>Added: ${added}.</li>
        <li>Updated: ${updated}.</li>
        <li>Removed: ${removed}.</li>
      </ul>
    </div>
  `;

  return ChatMessage.create({
    speaker: { alias: "Gamemaster" },
    whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id),
    content
  });
}

async function syncSpellbookForActor(actor) {
  if (!actor) {
    throw new Error("No actor supplied to syncSpellbookForActor.");
  }

  const rulesVersion = getRulesVersion();
  const wizardLevel = getWizardLevel(actor);
  const wizardSpells = getWizardSpellsFromActor(actor);

  const { item: spellbookItem, created: createdSpellbook } =
    await ensureSpellbookItem(actor, wizardSpells, wizardLevel);

  const { added, updated, removed } = await syncSpellsIntoSpellbook(
    actor,
    spellbookItem,
    wizardSpells
  );

  // Refresh the description after copies are synced
  await spellbookItem.update({
    img: SPELLBOOK_ICON,
    system: {
      ...(spellbookItem.system ?? {}),
      description: {
        ...(spellbookItem.system?.description ?? {}),
        value: buildSpellbookHtml(actor, wizardSpells, wizardLevel, rulesVersion)
      }
    }
  });

  await applySpellbookFlags(
    spellbookItem,
    actor,
    wizardLevel,
    rulesVersion,
    wizardSpells.length
  );

  await createSummaryChatMessage({
    actor,
    createdSpellbook,
    wizardSpells,
    wizardLevel,
    rulesVersion,
    added,
    updated,
    removed
  });

  ui.notifications.info(`${actor.name}: spellbook synced successfully.`);
  log(`${actor.name}: spellbook synced successfully.`);

  return {
    actorId: actor.id,
    actorName: actor.name,
    itemId: spellbookItem.id,
    itemName: spellbookItem.name,
    itemType: spellbookItem.type,
    createdSpellbook,
    rulesVersion,
    wizardLevel,
    storedSpellCount: wizardSpells.length,
    added,
    updated,
    removed
  };
}

Hooks.once("ready", () => {
  game[MODULE_ID] = {
    syncSpellbookForActor
  };

  log("Module ready.");
});
