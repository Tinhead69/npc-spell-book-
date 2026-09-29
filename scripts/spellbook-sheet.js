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
    classes: ["npc-spell-book", "sheet", "item", "dnd5e2"],
    position: { width: 620, height: 680 },
    window: { resizable: true },
    tag: "form",
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: {
      addSpell: NpcSpellbookSheet.#onAddSpell,
      removeSpell: NpcSpellbookSheet.#onRemoveSpell,
      studySpellbook: NpcSpellbookSheet.#onStudySpellbook,
      editImage: NpcSpellbookSheet.#onEditImage
    }
  };

  /** @override */
  static PARTS = {
    body: {
      template: "modules/npc-spell-book/templates/spellbook-sheet.hbs",
      scrollable: [".spellbook-spells"]
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
    const rawSpells = getSpellbookSpells(this.document);

    // Group spells strictly by level
    const groups = {};

    for (const spell of rawSpells) {
      const level = spell.level ?? 0;
      const key = `level-${level}`;
      const label = level === 0 ? "Cantrips" : `${this.#ordinalSuffix(level)} Level`;

      if (!groups[key]) {
        groups[key] = {
          order: level,
          label: label,
          spells: []
        };
      }

      groups[key].spells.push({
        ...spell,
        components: spell.components || "V, S",
        activation: spell.activation || "A",
        range: spell.range || "Self",
        target: spell.target || "1 creature",
        roll: spell.roll || "—"
      });
    }

    const sortedGroups = Object.values(groups).sort((a, b) => a.order - b.order);

    return {
      ...context,
      document: this.document,
      item: this.document,
      spellGroups: sortedGroups,
      spells: rawSpells,
      editable: this.isEditable
    };
  }

  #ordinalSuffix(i) {
    const j = i % 10, k = i % 100;
    if (j === 1 && k !== 11) return i + "st";
    if (j === 2 && k !== 12) return i + "nd";
    if (j === 3 && k !== 13) return i + "rd";
    return i + "th";
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
        const selection = await Browser.select({
          filters: {
            locked: { documentClass: "Item", types: new Set(["spell"]) },
            initial: { documentClass: "Item", types: new Set(["spell"]) }
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

  static async #onEditImage(event, target) {
    const sheet = /** @type {NpcSpellbookSheet} */ (this);
    if (!sheet.isEditable) return;

    const current = sheet.document.img;

    const fp = new FilePicker({
      type: "image",
      current: current,
      field: target,
      callback: async (path) => {
        await sheet.document.update({ img: path });
      },
      top: sheet.position.top + 40,
      left: sheet.position.left + 10
    });

    return fp.browse(current);
  }
}
