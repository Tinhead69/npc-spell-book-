const MODULE_ID = "npc-spell-book";
const SPELLBOOK_ICON = "icons/sundries/books/book-symbol-moon-gold-blue.webp";

function log(...args) {
  console.log("NPC Spellbook |", ...args);
}

function getRulesVersion() {
  try {
    return game.settings.get("dnd5e", "modern") ?? "legacy";
  } catch (err) {
    console.warn("NPC Spellbook | Could not read dnd5e rules version setting", err);
    return "legacy";
  }
}

function getWizardLevel(actor) {
  const actorClasses = actor?.classes ?? actor?.system?.classes ?? {};
  const wizard = actorClasses?.wizard;
  return Number(wizard?.system?.levels ?? wizard?.levels ?? 0);
}

function isWizardActor(actor) {
  return getWizardLevel(actor) > 0;
}

function getExpectedMinimumSpellCount(wizardLevel) {
  if (wizardLevel < 1) return 0;
  return 6 + ((wizardLevel - 1) * 2);
}

function getSpellbookName(actor) {
  return `Spell book of ${actor.name}`;
}

function getActiveWizardCharacters() {
  return game.users
    .filter(user => user.active && !user.isGM && user.character)
    .map(user => {
      const actor = user.character;
      const wizardLevel = getWizardLevel(actor);
      return {
        userId: user.id,
        userName: user.name,
        actorId: actor.id,
        actorName: actor.name,
        wizardLevel,
        actor
      };
    })
    .filter(entry => entry.wizardLevel > 0);
}

function isEquippedItem(item) {
  return Boolean(item?.system?.equipped);
}

function isFlaggedSpellbook(item) {
  return item?.getFlag(MODULE_ID, "isSpellbook") === true;
}

function findExistingSpellbook(actor) {
  const expectedName = getSpellbookName(actor);
  const items = actor.items.contents ?? Array.from(actor.items);
  return (
    items.find(item =>
      item.name === expectedName &&
      isFlaggedSpellbook(item) &&
      isEquippedItem(item)
    ) ||
    items.find(item =>
      item.name === expectedName &&
      isFlaggedSpellbook(item)
    ) ||
    null
  );
}

function getSpellOriginClass(spell) {
  const candidates = [
    spell?.flags?.dnd5e?.sourceClass,
    spell?.flags?.[MODULE_ID]?.sourceClass,
    spell?.system?.sourceClass,
    spell?.system?.source?.class,
    spell?.system?.source?.classes,
    spell?.system?.chatFlavor
  ].filter(Boolean);

  for (const value of candidates) {
    if (typeof value === "string") return value.toLowerCase();
    if (Array.isArray(value)) return value.join(" ").toLowerCase();
    if (typeof value === "object") return JSON.stringify(value).toLowerCase();
  }

  return "";
}

function spellMatchesRulesVersion(spell, rulesVersion) {
  const text = JSON.stringify({
    source: spell?.system?.source ?? null,
    flags: spell?.flags?.dnd5e ?? null,
    folder: spell?.folder?.name ?? null,
    pack: spell?.pack ?? null
  }).toLowerCase();

  if (rulesVersion === "modern") {
    if (text.includes("2014") || text.includes("legacy")) return false;
  } else {
    if (text.includes("2024") || text.includes("modern")) return false;
  }

  return true;
}

function spellBelongsToWizard(spell) {
  const origin = getSpellOriginClass(spell);
  if (!origin) return true;
  return origin.includes("wizard");
}

function getWizardSpellsFromActor(actor) {
  const rulesVersion = getRulesVersion();
  const allSpells = (actor.items.contents ?? Array.from(actor.items)).filter(item => item.type === "spell");
  return allSpells.filter(spell => spellBelongsToWizard(spell) && spellMatchesRulesVersion(spell, rulesVersion));
}

function buildStoredSpellData(spell, actor) {
  return {
    id: spell.id,
    name: spell.name,
    img: spell.img,
    level: Number(spell.system?.level ?? 0),
    school: spell.system?.school ?? "",
    sourceClass: getSpellOriginClass(spell) || "wizard",
    rulesVersion: getRulesVersion(),
    sourceActorId: actor.id,
    sourceItemId: spell.id,
    copiedAt: new Date().toISOString(),
    data: spell.toObject()
  };
}

async function ensureSpellbookItem(actor) {
  let book = findExistingSpellbook(actor);
  if (book) return { book, created: false };

  const itemData = {
    name: getSpellbookName(actor),
    type: "container",
    img: SPELLBOOK_ICON,
    system: {
      equipped: true
    },
    flags: {
      [MODULE_ID]: {
        isSpellbook: true,
        ownerActorId: actor.id,
        ownerActorName: actor.name,
        rulesVersion: getRulesVersion(),
        wizardLevel: getWizardLevel(actor),
        spells: []
      }
    }
  };

  const createdDocs = await actor.createEmbeddedDocuments("Item", [itemData]);
  const created = createdDocs?.[0];
  if (!created) throw new Error("Failed to create spellbook item.");
  return { book: created, created: true };
}

function mergeSpellLists(existingSpells, actorSpells) {
  const byName = new Map();
  for (const spell of existingSpells) {
    byName.set((spell.name ?? "").toLowerCase(), spell);
  }

  let added = 0;
  let updated = 0;

  for (const spell of actorSpells) {
    const key = (spell.name ?? "").toLowerCase();
    if (byName.has(key)) {
      byName.set(key, {
        ...byName.get(key),
        ...spell,
        syncedAt: new Date().toISOString()
      });
      updated += 1;
    } else {
      byName.set(key, spell);
      added += 1;
    }
  }

  return {
    spells: Array.from(byName.values()).sort((a, b) => {
      const levelDelta = (a.level ?? 0) - (b.level ?? 0);
      return levelDelta || String(a.name).localeCompare(String(b.name));
    }),
    added,
    updated
  };
}

async function syncSpellbookForActor(actor) {
  if (!actor) {
    ui.notifications.warn("No actor provided.");
    return null;
  }

  if (!isWizardActor(actor)) {
    ui.notifications.warn(`${actor.name} is not a wizard or multiclassed wizard.`);
    return null;
  }

  const wizardLevel = getWizardLevel(actor);
  const expectedMinimum = getExpectedMinimumSpellCount(wizardLevel);
  const actorWizardSpells = getWizardSpellsFromActor(actor).map(spell => buildStoredSpellData(spell, actor));

  const ensured = await ensureSpellbookItem(actor);
  const book = ensured.book;
  const created = ensured.created;

  const existingSpells = book.getFlag(MODULE_ID, "spells") ?? [];
  const merged = mergeSpellLists(existingSpells, actorWizardSpells);

  await book.update({
    "name": getSpellbookName(actor),
    "system.equipped": true,
    [`flags.${MODULE_ID}.isSpellbook`]: true,
    [`flags.${MODULE_ID}.ownerActorId`]: actor.id,
    [`flags.${MODULE_ID}.ownerActorName`]: actor.name,
    [`flags.${MODULE_ID}.rulesVersion`]: getRulesVersion(),
    [`flags.${MODULE_ID}.wizardLevel`]: wizardLevel,
    [`flags.${MODULE_ID}.spells`]: merged.spells
  });

  const actualCount = merged.spells.length;
  const problems = [];
  if (actualCount < expectedMinimum) {
    problems.push(`baseline minimum is ${expectedMinimum}, but the spellbook currently contains ${actualCount} wizard spells`);
  }

  const summary = [
    created ? "Created spellbook." : "Updated spellbook.",
    `Rules version: ${getRulesVersion()}.`,
    `Wizard level: ${wizardLevel}.`,
    `Spells stored: ${actualCount}.`,
    `Added: ${merged.added}.`,
    `Updated: ${merged.updated}.`
  ];

  if (problems.length) {
    summary.push(`Warning: ${problems.join("; ")}.`);
    ui.notifications.warn(`${actor.name}: ${problems.join("; ")}.`);
  } else {
    ui.notifications.info(`${actor.name}: spellbook synced successfully.`);
  }

  const whisperIds = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
  ChatMessage.create({
    content: `<h3>NPC Spellbook</h3><p><strong>${actor.name}</strong></p><ul>${summary.map(line => `<li>${line}</li>`).join("")}</ul>`,
    whisper: whisperIds
  });

  return { actor, book, created, expectedMinimum, actualCount, rulesVersion: getRulesVersion() };
}

function canManageSpellbook(actor) {
  return game.user.isGM && ["character", "npc"].includes(actor?.type) && isWizardActor(actor);
}

Hooks.once("init", () => {
  log("Initialising");

  game[MODULE_ID] = {
    getActiveWizardCharacters,
    syncSpellbookForActor,
    getRulesVersion,
    getWizardLevel
  };

  const ActorDirectoryClass =
    foundry?.applications?.sidebar?.tabs?.ActorDirectory ?? globalThis.ActorDirectory;

  if (ActorDirectoryClass?.prototype?._getEntryContextOptions) {
    const original = ActorDirectoryClass.prototype._getEntryContextOptions;
    ActorDirectoryClass.prototype._getEntryContextOptions = function () {
      const options = original.call(this) ?? [];

      options.push({
        name: "Generate / Sync Spellbook",
        icon: '<i class="fas fa-book"></i>',
        condition: li => {
          const id =
            li?.dataset?.entryId ??
            li?.dataset?.documentId ??
            li?.getAttribute?.("data-entry-id") ??
            li?.getAttribute?.("data-document-id") ??
            null;
          const actor = game.actors.get(id);
          return canManageSpellbook(actor);
        },
        callback: async li => {
          const id =
            li?.dataset?.entryId ??
            li?.dataset?.documentId ??
            li?.getAttribute?.("data-entry-id") ??
            li?.getAttribute?.("data-document-id") ??
            null;
          const actor = game.actors.get(id);
          await syncSpellbookForActor(actor);
        }
      });

      return options;
    };
  } else {
    console.warn("NPC Spellbook | Could not patch actor directory context menu");
  }

  const ActorSheetClass = globalThis.ActorSheet ?? foundry?.applications?.sheets?.ActorSheet;
  if (ActorSheetClass?.prototype?._getHeaderButtons) {
    const originalButtons = ActorSheetClass.prototype._getHeaderButtons;
    ActorSheetClass.prototype._getHeaderButtons = function () {
      const buttons = originalButtons.call(this);
      const actor = this.actor;
      if (canManageSpellbook(actor)) {
        buttons.unshift({
          label: "Spellbook",
          class: "npc-spellbook-sync",
          icon: "fas fa-book",
          onclick: async () => {
            await syncSpellbookForActor(actor);
          }
        });
      }
      return buttons;
    };
  } else {
    console.warn("NPC Spellbook | Could not patch actor sheet header buttons");
  }
});

Hooks.once("ready", () => {
  log("Ready");
  log("Active wizard PCs:", getActiveWizardCharacters().map(w => `${w.actorName} (${w.wizardLevel})`));
});
