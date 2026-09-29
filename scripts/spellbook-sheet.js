import {
  getSpellbookSpells,
  setSpellbookSpells,
  spellItemToEntry,
  isSpellbook
} from "./data.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class NpcSpellbookSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["npc-spell-book", "sheet", "item"],
    position: { width: 520, height: 600 },
    window: { resizable: true },
    tag: "form",
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: {
      addSpell: NpcSpellbookSheet.#onAddSpell,
      removeSpell: NpcSpellbookSheet.#onRemoveSpell,
      studySpellbook: NpcSpellbookSheet.#onStudySpellbook
    }
  };

  /** @override */
  static PARTS = {
    body: {
      template: "modules/npc-spell-book/templates/spellbook-sheet.hbs",
      scrollable: [""]
    }
  };

  /** @override */
  static _canRenderDocument(document, options, context) {
    return isSpellbook(document);
  }

  /** @override */
  get title() {
    return game.i18n.localize("NPC_SPELLBOOK.Sheet.Title");
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const spells = getSpellbookSpells(this.document).sort(
      (a, b) => a.level - b.level || a.name.localeCompare(b.name)
    );
    return {
      ...context,
      spells,
      editable: this.isEditable
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this._setupDropZone();
  }

  _setupDropZone() {
    const dropZone = this.element.querySelector(".spellbook-drop-zone");
    if (!dropZone || !this.isEditable) return;

    dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", async (event) => {
      event.preventDefault();
      dropZone.classList.remove("drag-over");
      await this._handleDrop(event);
    });
  }

  /** @param {DragEvent} event */
  async _handleDrop(event) {
    const data = foundry.applications.ux.TextEditor.getDragEventData(event);
    if (!data?.uuid) return;

    const doc = await fromUuid(data.uuid);
    if (!doc || doc.documentName !== "Item" || doc.type !== "spell") {
      ui.notifications.warn("Only spell items can be added to an NPC spellbook.");
      return;
    }

    await this._addSpellEntry(spellItemToEntry(doc));
  }

  /**
   * @param {import("./data.js").SpellEntry} entry
   */
  async _addSpellEntry(entry) {
    const spells = getSpellbookSpells(this.document);
    if (spells.some((s) => s.uuid === entry.uuid || s.name === entry.name)) {
      ui.notifications.info(`${entry.name} is already in this spellbook.`);
      return;
    }
    spells.push(entry);
    await setSpellbookSpells(this.document, spells);
    ui.notifications.info(game.i18n.format("NPC_SPELLBOOK.Notifications.SpellAdded", { spell: entry.name }));
    this.render(false);
  }

  static async #onAddSpell(event, target) {
    const sheet = /** @type {NpcSpellbookSheet} */ (this);

    try {
      const Browser = globalThis.dnd5e?.applications?.CompendiumBrowser
        ?? globalThis.game?.dnd5e?.applications?.CompendiumBrowser;

      if (Browser?.select) {
        // Lock browser to Item/spell so it doesn't open on Classes.
        const selection = await Browser.select({
          filters: {
            locked: {
              documentClass: "Item",
              types: new Set(["spell"])
            },
            initial: {
              documentClass: "Item",
              types: new Set(["spell"])
            }
          },
          selection: { min: 1, max: 50 }
        });

        if (!selection) return;

        const uuids = selection instanceof Set
          ? [...selection]
          : Array.isArray(selection)
            ? selection
            : [selection];

        for (const entry of uuids) {
          const doc = typeof entry === "string" ? await fromUuid(entry) : entry;
          if (doc?.type === "spell") await sheet._addSpellEntry(spellItemToEntry(doc));
        }
        return;
      }
    } catch (err) {
      console.warn("NPC Spellbook | Compendium browser unavailable", err);
    }

    ui.notifications.info(
      "Open Compendiums → Spells, then drag spell items onto this spellbook list."
    );
  }

  static async #onRemoveSpell(event, target) {
    const sheet = /** @type {NpcSpellbookSheet} */ (this);
    const uuid = target.closest("[data-spell-uuid]")?.dataset?.spellUuid;
    if (!uuid) return;

    const spells = getSpellbookSpells(sheet.document).filter((s) => s.uuid !== uuid);
    await setSpellbookSpells(sheet.document, spells);
    ui.notifications.info(game.i18n.localize("NPC_SPELLBOOK.Notifications.SpellRemoved"));
    sheet.render(false);
  }

  static async #onStudySpellbook(event, target) {
    const sheet = /** @type {NpcSpellbookSheet} */ (this);
    const { StudySpellbookDialog } = await import("./learn-dialog.js");
    new StudySpellbookDialog({ spellbook: sheet.document }).render(true);
  }
}
