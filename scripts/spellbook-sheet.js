import {
  MODULE_ID,
  getSpellbookSpells,
  removeSpellFromSpellbook,
  formatSpellEntry,
  buildStoredSpellData
} from "./data.js";
import { openTranscribeDialog } from "./mechanics.js";

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

    /** Action: Open dialog to browse and add spells */
    static async _onAddSpells(event, target) {
      const packs = game.packs.filter((p) => p.metadata.type === "Item");
      let allSpells = [];

      for (const pack of packs) {
        const index = await pack.getIndex({ fields: ["system.level", "img", "type"] });
        const spells = index.filter((i) => i.type === "spell");
        allSpells.push(...spells);
      }

      if (!allSpells.length) {
        ui.notifications.warn("No spell compendiums found in world.");
        return;
      }

      allSpells.sort((a, b) => a.name.localeCompare(b.name));

      const optionsHtml = allSpells
        .map((s) => `<option value="${s.uuid}">${s.name} (Lvl ${s.system?.level ?? 0})</option>`)
        .join("");

      const content = `
        <div style="padding: 6px;">
          <label style="font-weight: bold; font-size: 0.85rem;">Select Spell to Add:</label>
          <select id="spell-select" style="width: 100%; margin-top: 6px; padding: 4px; background: #111; color: #fff; border: 1px solid #444;">
            ${optionsHtml}
          </select>
        </div>
      `;

      const selectedUuid = await DialogV2.prompt({
        window: { title: "Add Spell to Spellbook" },
        content: content,
        ok: {
          label: "Add",
          icon: "fas fa-plus",
          callback: (event, button) => button.form.querySelector("#spell-select")?.value
        },
        rejectClose: false
      });

      if (selectedUuid) {
        const spellDoc = await fromUuid(selectedUuid);
        if (spellDoc) {
          const spells = Array.from(getSpellbookSpells(this.document));
          if (!spells.some((s) => s.uuid === spellDoc.uuid)) {
            spells.push(buildStoredSpellData(spellDoc));
            await this.document.setFlag(MODULE_ID, "spells", spells);
            this.render(true);
          } else {
            ui.notifications.info(`"${spellDoc.name}" is already in this spellbook.`);
          }
        }
      }
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
