import { MODULE_ID, getSpellbookSpells, setSpellbookSpells } from "./data.js";
import { StudySpellbookDialog } from "./learn-dialog.js";

const { HandlebarsApplicationMixin, ItemSheetV2 } = foundry.applications.api;

export class NpcSpellbookSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["npc-spell-book", "sheet", "item"],
    position: { width: 560, height: 600 },
    actions: {
      studySpellbook: NpcSpellbookSheet.#onStudySpellbook,
      removeSpell: NpcSpellbookSheet.#onRemoveSpell,
      editImage: NpcSpellbookSheet.#onEditImage
    },
    dragDrop: [{ dropSelector: ".spellbook-body" }]
  };

  /** @override */
  static PARTS = {
    body: { template: "modules/npc-spell-book/templates/spellbook-sheet.hbs" }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const rawSpells = getSpellbookSpells(item);

    // Group spells by level
    const groups = {};
    for (const spell of rawSpells) {
      // Handle dnd5e spell level structure variations
      const lvl = spell.level ?? spell.system?.level?.value ?? spell.system?.level ?? 0;
      const label = Number(lvl) === 0 ? "Cantrips" : `Level ${lvl} Spells`;
      
      if (!groups[lvl]) groups[lvl] = { level: Number(lvl), label, spells: [] };
      groups[lvl].spells.push({
        ...spell,
        level: Number(lvl)
      });
    }

    // Sort groups by level ascending
    const groupedSpells = Object.values(groups).sort((a, b) => a.level - b.level);

    return {
      ...context,
      item,
      groupedSpells,
      hasSpells: rawSpells.length > 0
    };
  }

  /** @override */
  async _onDrop(event) {
    event.preventDefault();
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch (e) {
      return;
    }

    if (data.type !== "Item") return;
    const item = await Item.implementation.fromDropData(data);
    if (!item || item.type !== "spell") {
      ui.notifications.warn("Only spell items can be added to spellbooks.");
      return;
    }

    const currentSpells = getSpellbookSpells(this.document);
    if (currentSpells.some((s) => s.name === item.name || s.uuid === item.uuid)) {
      ui.notifications.warn(`"${item.name}" is already in this spellbook.`);
      return;
    }

    // Extract spell level safely across dnd5e system versions
    const spellLevel = item.system?.level?.value ?? item.system?.level ?? 0;

    const spellData = {
      uuid: item.uuid,
      name: item.name,
      img: item.img,
      level: Number(spellLevel),
      system: item.system
    };

    currentSpells.push(spellData);
    await setSpellbookSpells(this.document, currentSpells);
    this.render(false);
  }

  static #onStudySpellbook() {
    new StudySpellbookDialog({ spellbook: this.document }).render(true);
  }

  static async #onRemoveSpell(event, target) {
    const uuid = target.closest("[data-entry-id]")?.dataset?.entryId;
    if (!uuid) return;

    const currentSpells = getSpellbookSpells(this.document);
    const updatedSpells = currentSpells.filter((s) => s.uuid !== uuid);
    await setSpellbookSpells(this.document, updatedSpells);
    this.render(false);
  }

  static async #onEditImage() {
    const fp = new FilePicker({
      type: "image",
      current: this.document.img,
      callback: (path) => this.document.update({ img: path })
    });
    fp.browse();
  }
}
