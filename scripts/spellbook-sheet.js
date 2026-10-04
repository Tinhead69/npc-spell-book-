import {
  MODULE_ID,
  canManageSpellbooks,
  getSpellbookSpells,
  addSpellToSpellbook,
  removeSpellFromSpellbook,
  formatSpellEntry,
  buildStoredSpellData,
  isWizardSpell,
  markSpellAsWizard
} from "./data.js";
import { openTranscribeDialog } from "./transcribe-dialog.js";
import { isWizard } from "./mechanics.js";
import { CompendiumSpellPicker } from "./spellbook-compendium.js";
import { bindSpellDescriptionTooltips, clearSpellTooltip } from "./spell-tooltip.js";

let SpellbookSheetClass = null;

/**
 * Prefer ItemSheetV2 (built-in drop pipeline); fall back to DocumentSheetV2.
 */
function getBaseDocumentSheet() {
  return foundry.applications.sheets?.ItemSheetV2
    || foundry.applications.api?.DocumentSheetV2
    || foundry.applications.sheets?.DocumentSheetV2
    || foundry.applications.api?.ApplicationV2;
}

function getDragDropClass() {
  return foundry.applications.ux?.DragDrop?.implementation
    || foundry.applications.ux?.DragDrop
    || globalThis.DragDrop;
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
        toggleLevel: SpellbookSheet._onToggleLevel,
        editImage: SpellbookSheet._onEditImage
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
      this._tooltipTimer = null;
      this._tooltipRow = null;
      this._unbindSpellTooltips = null;
      this._spellDragDrop = null;
    }

    get item() {
      return this.document;
    }

    /** GM/Trusted + world item only (not after the book is in an actor inventory). */
    _canEditSpellList() {
      const item = this.document;
      return Boolean(canManageSpellbooks() && !(item?.isEmbedded || item?.actor));
    }

    /** @override */
    _onFirstRender(context, options) {
      super._onFirstRender?.(context, options);
      this._unbindSpellTooltips = bindSpellDescriptionTooltips(this.element, this);
    }

    /** @override */
    _onRender(context, options) {
      super._onRender?.(context, options);
      this._bindSpellDropZone(this.element);
    }

    /** @override */
    async close(options) {
      this._unbindSpellTooltips?.();
      this._unbindSpellTooltips = null;
      clearSpellTooltip(this, true);
      this._spellDragDrop = null;
      return super.close(options);
    }

    /**
     * Bind AppV2 DragDrop so spells can be dropped from the sidebar / compendiums.
     */
    _bindSpellDropZone(html) {
      const DragDropClass = getDragDropClass();
      if (!DragDropClass || !html) return;

      this._spellDragDrop ??= new DragDropClass({
        dragSelector: null,
        dropSelector: ".spellbook-body",
        permissions: {
          dragstart: () => false,
          drop: () => this._canEditSpellList()
        },
        callbacks: {
          drop: (event) => this._onDropSpell(event)
        }
      });
      this._spellDragDrop.bind(html);
    }

    /** @override — ItemSheetV2 drop permission */
    _canDragDrop() {
      return this._canEditSpellList();
    }

    /**
     * @override — Prefer ItemSheetV2 / DocumentSheetV2 drop pipeline when present.
     */
    async _onDrop(event) {
      const handled = await this._onDropSpell(event);
      if (handled) return;
      return super._onDrop?.(event);
    }

    /**
     * Resolve a dropped Item and add it when it is a spell.
     * @returns {Promise<boolean>} true if the drop was handled (or rejected) here
     */
    async _onDropSpell(event) {
      event.preventDefault();
      const data = TextEditor.getDragEventData(event);
      if (!data?.type && !data?.uuid) return false;

      const looksLikeItem = !data.type || data.type === "Item" || data.type === "Item5e";
      if (!looksLikeItem) return false;

      if (!this._canEditSpellList()) {
        ui.notifications?.warn("Only a GM or Trusted Player can add spells to a world spellbook before it is claimed.");
        return true;
      }

      let spellDoc = null;
      try {
        if (typeof Item?.implementation?.fromDropData === "function") {
          spellDoc = await Item.implementation.fromDropData(data);
        } else if (data.uuid) {
          spellDoc = await fromUuid(data.uuid);
        }
      } catch (err) {
        console.warn("NPC Spellbook | Failed to resolve dropped document", err);
      }

      if (!spellDoc || spellDoc.documentName !== "Item") return false;

      if (spellDoc.type !== "spell") {
        ui.notifications?.warn("Only spells can be dropped onto a spellbook.");
        return true;
      }

      // World Items bar: GM may opt in untagged homebrew as wizard spells.
      const isWorldItem = !spellDoc.pack && Boolean(game.items?.get?.(spellDoc.id));
      if (isWorldItem && !isWizardSpell(spellDoc)) {
        const DialogV2 = foundry.applications.api?.DialogV2;
        const confirmed = DialogV2?.confirm
          ? await DialogV2.confirm({
            window: { title: "Mark as Wizard Spell?" },
            content: `<p><strong>${foundry.utils.escapeHTML?.(spellDoc.name) || spellDoc.name}</strong> is not on the wizard list.<br>Mark it as a wizard spell and add it to this book?</p>`,
            rejectClose: false
          })
          : window.confirm(`"${spellDoc.name}" is not on the wizard list. Mark it as a wizard spell and add it?`);

        if (!confirmed) return true;
        const marked = await markSpellAsWizard(spellDoc);
        if (!marked) return true;
      }

      await addSpellToSpellbook(this.document, spellDoc.uuid);
      this.render(true);
      return true;
    }

    /** @override */
    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      const item = this.document;
      context.item = item;

      // GM-only book editing, and only while the spellbook is a world item
      // (not after it has been placed in an actor inventory).
      context.canAddSpells = this._canEditSpellList();

      // Inventory books: only the owning actor may transcribe, and only if a Wizard.
      const owner = item?.actor
        ? (game.actors?.get?.(item.actor.id) || item.actor)
        : null;
      context.canTranscribe = owner ? isWizard(owner) : true;
      context.transcribeDisabledReason = "Only a Wizard May transcribe spells";

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

    /** Action: Change the spellbook icon via FilePicker */
    static async _onEditImage(event, target) {
      event.preventDefault();
      if (this.isEditable === false) return;

      const field = target.dataset.edit || target.dataset.field || "img";
      const current = foundry.utils.getProperty(this.document, field) || this.document.img;
      const FilePickerClass = foundry.applications.apps?.FilePicker?.implementation
        || globalThis.FilePicker;

      if (!FilePickerClass) {
        ui.notifications?.error("File picker is unavailable.");
        return;
      }

      const fp = new FilePickerClass({
        type: "image",
        current,
        callback: async (path) => {
          await this.document.update({ [field]: path });
          this.render(false);
        },
        top: this.position.top + 40,
        left: this.position.left + 10
      });
      return fp.browse();
    }

    /** Action: Open the three-pane spell picker (GM + world item only) */
    static async _onAddSpells(event, target) {
      const item = this.document;
      if (!this._canEditSpellList()) {
        ui.notifications?.warn(
          canManageSpellbooks()
            ? "Spells cannot be added after the spellbook is in an actor's inventory."
            : "Only a GM or Trusted Player can add spells to a spellbook."
        );
        return;
      }
      new CompendiumSpellPicker({ spellbook: item }).render({ force: true });
    }

    /** Action: Open transcribe dialog */
    static _onTranscribeSpells(event, target) {
      const item = this.document;
      const owner = item?.actor
        ? (game.actors?.get?.(item.actor.id) || item.actor)
        : null;
      if (owner && !isWizard(owner)) {
        ui.notifications?.warn("Only a Wizard May transcribe spells");
        return;
      }
      openTranscribeDialog(item);
    }

    /** Action: Clear all spells (GM + world item only) */
    static async _onClearSpellbook(event, target) {
      if (!this._canEditSpellList()) {
        ui.notifications?.warn("Only a GM or Trusted Player can clear a world spellbook before it is claimed.");
        return;
      }
      const item = this.document;

      const confirmed = await DialogV2.confirm({
        window: { title: "Clear Spellbook" },
        content: "<p>Are you sure you want to remove all spells from this spellbook?</p>",
        rejectClose: false
      });

      if (confirmed) {
        await item.unsetFlag(MODULE_ID, "spells");
        this.render(true);
      }
    }

    /** Action: Delete individual spell (GM + world item only) */
    static async _onDeleteSpell(event, target) {
      if (!this._canEditSpellList()) {
        ui.notifications?.warn("Only a GM or Trusted Player can edit spells on a world spellbook.");
        return;
      }

      const uuid = target.dataset.uuid;
      if (uuid) {
        clearSpellTooltip(this, true);
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
