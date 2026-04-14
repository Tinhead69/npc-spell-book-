const MODULE_ID = "npc-spell-book";
const SPELLBOOK_ICON = "icons/svg/book.svg";
const FORMULA_ICON = "icons/svg/scroll.svg";
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

function getSpellbookDisplayName(actor) {
  return `Spell book of ${actor.name}`;
}

function getSpellbookStorageName(actor) {
  return `Spell book of ${actor.name} [Storage]`;
}

function isVisibleSpellbookItem(item) {
  return item?.getFlag?.(MODULE_ID, "spellbookVisible") === true;
}

function isSpellbookStorage(item) {
  return item?.getFlag?.(MODULE_ID, "spellbookStorage") === true;
}

function isLegacySpellCopy(item) {
  return item?.getFlag?.(MODULE_ID, "spellCopy") === true;
}

function isFormulaEntry(item) {
  return item?.getFlag?.(MODULE_ID, "formulaEntry") === true;
}

function getFormulaItemName(sourceSpell) {
  return `Spell Formula: ${sourceSpell.name}`;
}

function getSourceSpellsFromActor(actor) {
  const actorItems = actor?.items?.contents ?? [];

  return actorItems
    .filter((item) => item.type === "spell" && !isLegacySpellCopy(item))
    .sort((a, b) => {
      const aLevel = Number(a.system?.level ?? 0);
      const bLevel = Number(b.system?.level ?? 0);
      if (aLevel !== bLevel) return aLevel - bLevel;
      return a.name.localeCompare(b.name);
    });
}

function buildStoredSpellData(sourceSpell) {
  return {
    id: sourceSpell.id,
    name: sourceSpell.name,
    uuid: sourceSpell.uuid,
    img: sourceSpell.img || FALLBACK_SPELL_ICON,
    level: Number(sourceSpell.system?.level ?? 0),
    school: sourceSpell.system?.school ?? "",
    description: sourceSpell.system?.description?.value ?? "",
    source: sourceSpell.system?.source ?? {},
    activation: sourceSpell.system?.activation ?? {},
    duration: sourceSpell.system?.duration ?? {},
    target: sourceSpell.system?.target ?? {},
    range: sourceSpell.system?.range ?? {},
    uses: sourceSpell.system?.uses ?? {},
    materials: sourceSpell.system?.materials ?? {},
    consume: sourceSpell.system?.consume ?? {},
    method: sourceSpell.system?.method ?? "",
    prepared: sourceSpell.system?.prepared ?? false,
    scaling: sourceSpell.system?.scaling ?? {}
  };
}

function buildSpellbookHtml(actor, storedSpells, wizardLevel, rulesVersion) {
  const grouped = new Map();

  for (const spell of storedSpells) {
    const level = Number(spell.level ?? 0);
    if (!grouped.has(level)) grouped.set(level, []);
    grouped.get(level).push(spell);
  }

  const sections = [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, entries]) => {
      const heading = level === 0 ? "Cantrips" : `Level ${level}`;
      const list = entries
        .map((spell) => {
          const school = spell.school ? ` <em>(${spell.school})</em>` : "";
          return `<li><strong>${spell.name}</strong>${school}</li>`;
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
      <p><strong>Stored spells:</strong> ${storedSpells.length}</p>
      <hr />
      ${sections || "<p><em>No spells stored.</em></p>"}
    </div>
  `.trim();
}

function buildVisibleBookHtml(actor, storedSpells, storageContainer) {
  return `
    <div class="npc-spell-book-link">
      <h1 style="margin-bottom: 0.5em;">${getSpellbookDisplayName(actor)}</h1>
      <p>This item links to the backing spellbook container.</p>
      <p><strong>Stored spells:</strong> ${storedSpells.length}</p>
      <p><strong>Linked container ID:</strong> ${storageContainer.id}</p>
    </div>
  `.trim();
}

async function applyStorageFlags(item, actor, wizardLevel, rulesVersion, storedSpells, visibleBook = null) {
  await item.setFlag(MODULE_ID, "spellbookStorage", true);
  await item.setFlag(MODULE_ID, "ownerActorId", actor.id);
  await item.setFlag(MODULE_ID, "wizardLevel", wizardLevel);
  await item.setFlag(MODULE_ID, "rulesVersion", rulesVersion);
  await item.setFlag(MODULE_ID, "storedSpellCount", storedSpells.length);
  await item.setFlag(MODULE_ID, "storedSpells", storedSpells);
  await item.setFlag(MODULE_ID, "linkedBookId", visibleBook?.id ?? null);
  await item.setFlag(MODULE_ID, "syncedAt", new Date().toISOString());
}

async function applyVisibleBookFlags(item, actor, storageContainer, storedSpells) {
  await item.setFlag(MODULE_ID, "spellbookVisible", true);
  await item.setFlag(MODULE_ID, "ownerActorId", actor.id);
  await item.setFlag(MODULE_ID, "linkedContainerId", storageContainer.id);
  await item.setFlag(MODULE_ID, "storedSpellCount", storedSpells.length);
  await item.setFlag(MODULE_ID, "syncedAt", new Date().toISOString());
}

async function ensureSpellbookItems(actor, storedSpells, wizardLevel) {
  const rulesVersion = getRulesVersion();
  const displayName = getSpellbookDisplayName(actor);
  const storageName = getSpellbookStorageName(actor);

  let storageContainer = actor.items.find((item) => isSpellbookStorage(item));
  if (!storageContainer) {
    storageContainer = actor.items.find(
      (item) => item.name === storageName && item.type === "container"
    );
  }

  if (!storageContainer) {
    const legacyContainer = actor.items.find(
      (item) => item.name === displayName && item.type === "container"
    );
    if (legacyContainer) {
      storageContainer = legacyContainer;
    }
  }

  const storageHtml = buildSpellbookHtml(actor, storedSpells, wizardLevel, rulesVersion);

  if (storageContainer) {
    await storageContainer.update({
      name: storageName,
      img: SPELLBOOK_ICON,
      system: {
        ...(storageContainer.system ?? {}),
        description: {
          ...(storageContainer.system?.description ?? {}),
          value: storageHtml
        }
      }
    });
  } else {
    const created = await actor.createEmbeddedDocuments("Item", [
      {
        name: storageName,
        type: "container",
        img: SPELLBOOK_ICON,
        system: {
          description: {
            value: storageHtml
          }
        }
      }
    ]);
    storageContainer = created?.[0] ?? null;
  }

  if (!storageContainer) {
    throw new Error(`Failed to create spellbook storage container for ${actor.name}.`);
  }

  let visibleBook = actor.items.find((item) => isVisibleSpellbookItem(item));
  if (!visibleBook) {
    visibleBook = actor.items.find(
      (item) => item.name === displayName && item.type !== "container"
    );
  }

  const visibleHtml = buildVisibleBookHtml(actor, storedSpells, storageContainer);

  if (visibleBook) {
    await visibleBook.update({
      name: displayName,
      img: SPELLBOOK_ICON,
      system: {
        ...(visibleBook.system ?? {}),
        description: {
          ...(visibleBook.system?.description ?? {}),
          value: visibleHtml
        }
      }
    });
  } else {
    const created = await actor.createEmbeddedDocuments("Item", [
      {
        name: displayName,
        type: "loot",
        img: SPELLBOOK_ICON,
        system: {
          quantity: 1,
          weight: 0,
          price: {
            value: 0,
            denomination: "gp"
          },
          description: {
            value: visibleHtml
          }
        }
      }
    ]);
    visibleBook = created?.[0] ?? null;
  }

  if (!visibleBook) {
    throw new Error(`Failed to create visible spellbook item for ${actor.name}.`);
  }

  await applyVisibleBookFlags(visibleBook, actor, storageContainer, storedSpells);
  await applyStorageFlags(storageContainer, actor, wizardLevel, rulesVersion, storedSpells, visibleBook);

  return { visibleBook, storageContainer };
}

async function removeLegacySpellCopies(actor) {
  const copies = actor.items.filter((item) => isLegacySpellCopy(item));
  if (!copies.length) return 0;

  await actor.deleteEmbeddedDocuments("Item", copies.map((item) => item.id));
  log(`${actor.name}: removed ${copies.length} legacy spell cop${copies.length === 1 ? "y" : "ies"}.`);
  return copies.length;
}

function buildFormulaDescription(sourceSpell) {
  const level = Number(sourceSpell.system?.level ?? 0);
  const levelText = level === 0 ? "Cantrip" : `Level ${level}`;
  const school = sourceSpell.system?.school ? ` • ${sourceSpell.system.school}` : "";
  const description = sourceSpell.system?.description?.value ?? "";

  return `
    <div class="npc-spell-formula">
      <p><strong>${sourceSpell.name}</strong></p>
      <p><em>${levelText}${school}</em></p>
      <hr />
      ${description || "<p><em>No description available.</em></p>"}
    </div>
  `.trim();
}

function buildFormulaItemData(sourceSpell, storageContainer) {
  return {
    name: getFormulaItemName(sourceSpell),
    type: "loot",
    img: sourceSpell.img || FORMULA_ICON,
    system: {
      quantity: 1,
      weight: 0,
      price: {
        value: 0,
        denomination: "gp"
      },
      description: {
        value: buildFormulaDescription(sourceSpell)
      },
      container: storageContainer.id
    },
    flags: {
      [MODULE_ID]: {
        formulaEntry: true,
        sourceSpellId: sourceSpell.id,
        sourceSpellUuid: sourceSpell.uuid,
        spellName: sourceSpell.name,
        level: Number(sourceSpell.system?.level ?? 0),
        school: sourceSpell.system?.school ?? "",
        syncedAt: new Date().toISOString()
      }
    }
  };
}

async function syncFormulaEntries(actor, storageContainer, sourceSpells) {
  const actorItems = actor.items.contents ?? [];

  const existingEntries = actorItems.filter(
    (item) => isFormulaEntry(item) && item.system?.container === storageContainer.id
  );

  const existingBySourceId = new Map(
    existingEntries.map((item) => [item.getFlag(MODULE_ID, "sourceSpellId"), item])
  );

  const sourceIds = new Set(sourceSpells.map((spell) => spell.id));

  let added = 0;
  let updated = 0;
  let removed = 0;

  for (const sourceSpell of sourceSpells) {
    const itemData = buildFormulaItemData(sourceSpell, storageContainer);
    const existingEntry = existingBySourceId.get(sourceSpell.id);

    if (existingEntry) {
      await existingEntry.update(itemData);
      updated += 1;
    } else {
      const created = await actor.createEmbeddedDocuments("Item", [itemData]);
      if (created?.[0]) added += 1;
    }
  }

  const staleEntries = existingEntries.filter((item) => {
    const sourceSpellId = item.getFlag(MODULE_ID, "sourceSpellId");
    return !sourceIds.has(sourceSpellId);
  });

  if (staleEntries.length) {
    await actor.deleteEmbeddedDocuments(
      "Item",
      staleEntries.map((item) => item.id)
    );
    removed = staleEntries.length;
  }

  return { added, updated, removed };
}

async function createSummaryChatMessage({
  actor,
  createdVisibleBook,
  createdStorageContainer,
  storedSpells,
  wizardLevel,
  rulesVersion,
  removedCopies,
  addedEntries,
  updatedEntries,
  removedEntries
}) {
  const content = `
    <div class="npc-spellbook-summary">
      <h1 style="margin:0 0 0.5em 0;">NPC Spellbook</h1>
      <h3 style="margin:0 0 0.5em 0;">${actor.name}</h3>
      <ul style="margin:0; padding-left:1.25em;">
        <li>${createdVisibleBook ? "Created visible spellbook item." : "Updated visible spellbook item."}</li>
        <li>${createdStorageContainer ? "Created storage container." : "Updated storage container."}</li>
        <li>Rules version: ${rulesVersion}.</li>
        <li>Wizard level: ${wizardLevel}.</li>
        <li>Spells stored: ${storedSpells.length}.</li>
        <li>Legacy spell copies removed: ${removedCopies}.</li>
        <li>Formula entries added: ${addedEntries}.</li>
        <li>Formula entries updated: ${updatedEntries}.</li>
        <li>Formula entries removed: ${removedEntries}.</li>
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
  const sourceSpells = getSourceSpellsFromActor(actor);
  const storedSpells = sourceSpells.map(buildStoredSpellData);

  const removedCopies = await removeLegacySpellCopies(actor);

  const hadVisibleBook = actor.items.some((item) => isVisibleSpellbookItem(item));
  const hadStorageContainer = actor.items.some((item) => isSpellbookStorage(item));

  const { visibleBook, storageContainer } = await ensureSpellbookItems(
    actor,
    storedSpells,
    wizardLevel
  );

  const {
    added: addedEntries,
    updated: updatedEntries,
    removed: removedEntries
  } = await syncFormulaEntries(actor, storageContainer, sourceSpells);

  await createSummaryChatMessage({
    actor,
    createdVisibleBook: !hadVisibleBook,
    createdStorageContainer: !hadStorageContainer,
    storedSpells,
    wizardLevel,
    rulesVersion,
    removedCopies,
    addedEntries,
    updatedEntries,
    removedEntries
  });

  ui.notifications.info(`${actor.name}: spellbook synced successfully.`);
  log(`${actor.name}: spellbook synced successfully.`);

  return {
    actor,
    book: visibleBook,
    container: storageContainer,
    createdVisibleBook: !hadVisibleBook,
    createdStorageContainer: !hadStorageContainer,
    rulesVersion,
    wizardLevel,
    storedSpellCount: storedSpells.length,
    removedCopies,
    addedEntries,
    updatedEntries,
    removedEntries
  };
}

Hooks.once("ready", () => {
  game[MODULE_ID] = {
    syncSpellbookForActor
  };

  log("Module ready.");
});
