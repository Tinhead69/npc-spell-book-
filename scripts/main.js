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

function isSpellCopy(item) {
  return item?.getFlag?.(MODULE_ID, "spellCopy") === true;
}

function getSourceSpellsFromActor(actor) {
  const actorItems = actor?.items?.contents ?? [];

  const spells = actorItems
    .filter((item) => item.type === "spell" && !isSpellCopy(item))
    .sort((a, b) => {
      const aLevel = Number(a.system?.level ?? 0);
      const bLevel = Number(b.system?.level ?? 0);
      if (aLevel !== bLevel) return aLevel - bLevel;
      return a.name.localeCompare(b.name);
    });

  log(`${actor.name}: found ${spells.length} source spell(s).`, spells.map((s) => s.name));
  return spells;
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
    preparation: sourceSpell.system?.preparation ?? {},
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

async function applySpellbookFlags(item, actor, wizardLevel, rulesVersion, storedSpells) {
  await item.setFlag(MODULE_ID, "spellbook", true);
  await item.setFlag(MODULE_ID, "ownerActorId", actor.id);
  await item.setFlag(MODULE_ID, "wizardLevel", wizardLevel);
  await item.setFlag(MODULE_ID, "rulesVersion", rulesVersion);
  await item.setFlag(MODULE_ID, "storedSpellCount", storedSpells.length);
  await item.setFlag(MODULE_ID, "storedSpells", storedSpells);
  await item.setFlag(MODULE_ID, "syncedAt", new Date().toISOString());
}

async function ensureSpellbookItem(actor, storedSpells, wizardLevel) {
  const itemName = getSpellbookItemName(actor);
  const rulesVersion = getRulesVersion();

  let spellbookItem = actor.items.find((item) => isSpellbookItem(item));
  if (!spellbookItem) {
    spellbookItem = actor.items.find((item) => item.name === itemName);
  }

  const html = buildSpellbookHtml(actor, storedSpells, wizardLevel, rulesVersion);

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
      storedSpells
    );

    return { item: spellbookItem, created: false };
  }

  const created = await actor.createEmbeddedDocuments("Item", [
    {
      name: itemName,
      type: "container",
      img: SPELLBOOK_ICON,
      system: {
        description: {
          value: html
        }
      }
    }
  ]);

  const createdItem = created?.[0];
  if (!createdItem) {
    throw new Error(`Failed to create spellbook item for ${actor.name}.`);
  }

  await applySpellbookFlags(
    createdItem,
    actor,
    wizardLevel,
    rulesVersion,
    storedSpells
  );

  return { item: createdItem, created: true };
}

async function removeLegacySpellCopies(actor) {
  const copies = actor.items.filter((item) => isSpellCopy(item));
  if (!copies.length) {
    return 0;
  }

  await actor.deleteEmbeddedDocuments(
    "Item",
    copies.map((item) => item.id)
  );

  log(`${actor.name}: removed ${copies.length} legacy spell cop${copies.length === 1 ? "y" : "ies"}.`);
  return copies.length;
}

async function createSummaryChatMessage({
  actor,
  createdSpellbook,
  storedSpells,
  wizardLevel,
  rulesVersion,
  removedCopies
}) {
  const content = `
    <div class="npc-spellbook-summary">
      <h1 style="margin:0 0 0.5em 0;">NPC Spellbook</h1>
      <h3 style="margin:0 0 0.5em 0;">${actor.name}</h3>
      <ul style="margin:0; padding-left:1.25em;">
        <li>${createdSpellbook ? "Created spellbook." : "Updated spellbook."}</li>
        <li>Rules version: ${rulesVersion}.</li>
        <li>Wizard level: ${wizardLevel}.</li>
        <li>Spells stored: ${storedSpells.length}.</li>
        <li>Legacy spell copies removed: ${removedCopies}.</li>
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

  const { item: spellbookItem, created: createdSpellbook } =
    await ensureSpellbookItem(actor, storedSpells, wizardLevel);

  await createSummaryChatMessage({
    actor,
    createdSpellbook,
    storedSpells,
    wizardLevel,
    rulesVersion,
    removedCopies
  });

  ui.notifications.info(`${actor.name}: spellbook synced successfully.`);
  log(`${actor.name}: spellbook synced successfully.`);

  return {
    actor,
    book: spellbookItem,
    created: createdSpellbook,
    rulesVersion,
    wizardLevel,
    storedSpellCount: storedSpells.length,
    removedCopies
  };
}

Hooks.once("ready", () => {
  game[MODULE_ID] = {
    syncSpellbookForActor
  };

  log("Module ready.");
});
