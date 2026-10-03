import {
  MODULE_ID,
  getSpellbookSpells,
  removeSpellFromSpellbook,
  formatSpellEntry,
  buildStoredSpellData
} from "./data.js";
import { openTranscribeDialog } from "./mechanics.js";
import { CompendiumSpellPicker } from "./spellbook-compendium.js";

let SpellbookSheetClass = null;

/**
 * Safely resolves DocumentSheetV2 across V13 ApplicationV2 namespaces
 */
function getBaseDocumentSheet() {
  return foundry.applications.api?.DocumentSheetV2
    || foundry.applications.sheets?.DocumentSheetV2
    || foundry.applications.api?.ApplicationV2;
}

/**
 * Enrich slim stored spells (uuid/name/img only) by resolving the source document.
 */
async function enrichSpellForDisplay(spell) {
  const hasSystem = Boolean(spell?.system?.activation || spell?.system?.range || spell?.system?.activities);
  if (hasSystem) return formatSpellEntry(spell);

  if (spell?.uuid) {
    try {
      const doc = await fromUuid(spell.uuid);
      if (doc) {
        return formatSpellEntry({
          ...buildStoredSpellData(doc),
          uuid: spell.uuid,
          name: spell.name || doc.name,
          img: spell.img || doc.img
        });
      }
    } catch (err) {
      console.warn("NPC Spellbook | Could not enrich spell", spell.uuid, err);
    }
  }

  return formatSpellEntry(spell);
}

/**
 * Constructs and caches the SpellbookSheet class during the init lifecycle
 */
export function getSpellbookSheetClass() {
  if (SpellbookSheetClass) return SpellbookSheetClass;

  const BaseSheet = getBaseDocumentSheet();
  const HandlebarsApplicationMixin = foundry.applications.api?.HandlebarsApplicationMixin;
  const DialogV2 = foundry.applications.api?.DialogV2;

  if (!BaseSheet || !HandlebarsApplicationMixin) {
    throw new Error("NPC Spellbook | Foundry ApplicationV2 sheet APIs are not available.");
  }

  SpellbookSheetClass = class SpellbookSheet extends HandlebarsApplicationMixin(BaseSheet) {
    static DEFAULT_OPTIONS = {
      classes: ["dnd5e", "sheet", "item", "spellbook-sheet"],
      position: { width: 720, height: 600 },
      window: {
        resizable: true,
        icon: "fas fa-book"
      },
      form: {
        submitOnChange: true,
        closeOnSubmit: false
      },
      actions: {
        addSpells: SpellbookSheet._onAddSpells,
        transcribeSpells: SpellbookSheet._onTranscribeSpells,
        clearSpellbook: SpellbookSheet._onClearSpellbook,
        deleteSpell: SpellbookSheet._onDeleteSpell,
        toggleLevel: SpellbookSheet._onToggleLevel
      }
    };

    static PARTS = {
      sheet: {
        template: `modules/${MODULE_ID}/templates/spellbook-sheet.hbs`
      }
    };

    constructor(options = {}) {
      super(options);
      this.collapsedLevels = new Set();
    }

    get item() {
      return this.document;
    }

    /** @override */
    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      const item = this.document;
      context.item = item;

      const spells = getSpellbookSpells(item);
      const displaySpells = await Promise.all(spells.map((s) => enrichSpellForDisplay(s)));

      const groups = {};
      for (const spell of displaySpells) {
        const lvl = Number(spell.level ?? 0);
        const label = lvl === 0 ? "CANTRIPS" : `LEVEL ${lvl}`;
        if (!groups[lvl]) {
          groups[lvl] = {
            level: lvl,
            label,
            collapsed: this.collapsedLevels.has(lvl),
            spells: []
          };
        }
        groups[lvl].spells.push(spell);
      }

      context.spellGroups = Object.keys(groups)
        .map(Number)
        .sort((a, b) => a - b)
        .map((lvl) => groups[lvl]);

      return context;
    }

    /** Action: Collapse / expand a spell level group */
    static _onToggleLevel(event, target) {
      event.preventDefault();
      const level = Number(target.dataset.level);
      if (Number.isNaN(level)) return;

      if (this.collapsedLevels.has(level)) this.collapsedLevels.delete(level);
      else this.collapsedLevels.add(level);

      this.render({ force: false });
    }

    /** Action: Open the three-pane spell picker */
    static async _onAddSpells(event, target) {
      new CompendiumSpellPicker({ spellbook: this.document }).render({ force: true });
    }

    /** Action: Open transcribe dialog */
    static _onTranscribeSpells(event, target) {
      openTranscribeDialog(this.document);
    }

    /** Action: Clear all spells */
    static async _onClearSpellbook(event, target) {
      const confirmed = await DialogV2.confirm({
        window: { title: "Clear Spellbook" },
        content: "<p>Are you sure you want to remove all spells from this spellbook?</p>",
        rejectClose: false
      });

      if (confirmed) {
        await this.document.unsetFlag(MODULE_ID, "spells");
        this.render(true);
      }
    }

    /** Action: Delete individual spell */
    static async _onDeleteSpell(event, target) {
      const uuid = target.dataset.uuid;
      if (uuid) {
        await removeSpellFromSpellbook(this.document, uuid);
        this.render(true);
      }
    }

    /** Persist name edits from the sheet header. */
    async _processSubmitData(event, form, submitData, options) {
      if (typeof super._processSubmitData === "function") {
        return super._processSubmitData(event, form, submitData, options);
      }
      await this.document.update(submitData, options);
    }
  };

  return SpellbookSheetClass;
}
