const MODULE_ID = "npc-spell-book";
const SPELLBOOK_ICON = "icons/svg/book.svg";
const FALLBACK_SPELL_ICON = "icons/svg/book.svg";

function log(...args) {
  console.log("NPC Spellbook |", ...args);
}

function warn(...args) {
  console.warn("NPC Spellbook |", ...args);
}

function error(...args) {
  console.error("NPC Spellbook |", ...args);
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

function getWizardSpellsFromActor(actor) {
  const actorItems = actor?.items?.contents ?? actor?.items ?? [];
  const wizardLevel = getWizardLevel(actor);

  const spells = actorItems.filter((item) => {
    if (item.type !== "spell") return false;

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

function buildStoredSpellData(spell) {
  return {
    id: spell.id,
    name: spell.name,
    uuid: spell.uuid,
    type: spell.type,
    img: spell.img || FALLBACK_SPELL_ICON,
    level: Number(spell.system?.level ?? 0),
    school: spell.system?.school ?? "",
    source: spell.system?.source ?? {},
    preparation: spell.system?.preparation ?? {},
    activation: spell.system?.activation ?? {},
    target: spell.system?.target ?? {},
    range: spell.system?.range ?? {},
    duration: spell.system?.duration ?? {},
    materials: spell.system?.materials ?? {},
    scaling: spell.system?.scaling ?? {},
    description:
      spell.system?.description?.value ??
      spell.system?.description ??
      ""
  };
}

function renderSpellbookHtml(actor, storedSpells, wizardLevel, rulesVersion) {
  const grouped = new Map();

  for (const spell of storedSpells) {
    const level = Number(spell.level ?? 0);
    if (!grouped.has(level)) grouped.set(level, []);
    grouped.get(level).push(spell);
  }

  const sections = [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, spells]) => {
      const heading = level === 0 ? "Cantrips" : `Level ${level}`;
      const list = spells
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

async function applySpellbookFlags(item, actor, storedSpells, wizardLevel, rulesVersion) {
  await item.setFlag(MODULE_ID, "spellbook", true);
  await item.setFlag(MODULE_ID, "ownerActorId", actor.id);
  await item.setFlag(MODULE_ID, "storedSpells", storedSpells);
  await item.setFlag(MODULE_ID, "wizardLevel", wizardLevel);
  await item.setFlag(MODULE_ID, "rulesVersion", rulesVersion);
  await item.setFlag(MODULE_ID, "syncedAt", new Date().toISOString());
}

async function ensureSpellbookItem(actor, storedSpells, wizardLevel) {
  const itemName = getSpellbookItemName(actor);
  const rulesVersion = getRulesVersion();

  let spellbookItem = actor.items.find((item) => isSpellbookItem(item));

  if (!spellbookItem) {
    spellbookItem = actor.items.find((item) => item.name === itemName);
  }

  const html = renderSpellbookHtml(actor, storedSpells, wizardLevel, rulesVersion);

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
      storedSpells,
      wizardLevel,
      rulesVersion
    );

    log(`Updated spellbook item for ${actor.name}: ${spellbookItem.name}`);
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

  const createdItem = created?.[0] ?? null;

  if (!createdItem) {
    throw new Error(`Failed to create spellbook item for ${actor.name}.`);
  }

  await applySpellbookFlags(
    createdItem,
    actor,
    storedSpells,
    wizardLevel,
    rulesVersion
  );

  log(`Created spellbook item for ${actor.name}: ${createdItem.name}`);
  return { item: createdItem, created: true };
}

async function createSummaryChatMessage({
  actor,
  created,
  storedSpells,
  wizardLevel,
  rulesVersion
}) {
  const content = `
    <div class="npc-spellbook-summary">
      <h1 style="margin:0 0 0.5em 0;">NPC Spellbook</h1>
      <h3 style="margin:0 0 0.5em 0;">${actor.name}</h3>
      <ul style="margin:0; padding-left:1.25em;">
        <li>${created ? "Created spellbook." : "Updated spellbook."}</li>
        <li>Rules version: ${rulesVersion}.</li>
        <li>Wizard level: ${wizardLevel}.</li>
        <li>Spells stored: ${storedSpells.length}.</li>
        <li>Added: ${created ? 1 : 0}.</li>
        <li>Updated: ${created ? 0 : 1}.</li>
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
  const storedSpells = wizardSpells.map(buildStoredSpellData);

  const { item, created } = await ensureSpellbookItem(
    actor,
    storedSpells,
    wizardLevel
  );

  await createSummaryChatMessage({
    actor,
    created,
    storedSpells,
    wizardLevel,
    rulesVersion
  });

  ui.notifications.info(`${actor.name}: spellbook synced successfully.`);
  log(`${actor.name}: spellbook synced successfully.`);

  return {
    actorId: actor.id,
    actorName: actor.name,
    itemId: item.id,
    itemName: item.name,
    itemType: item.type,
    created,
    rulesVersion,
    wizardLevel,
    storedSpellCount: storedSpells.length
  };
}

Hooks.once("ready", () => {
  game[MODULE_ID] = {
    syncSpellbookForActor
  };

  log("Module ready.");
});
