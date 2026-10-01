import { addSpellToSpellbook, getSpellbookSpells } from "./data.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CompendiumSpellPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.spellbook = options.spellbook;
    this.selectedPackId = options.selectedPackId ?? "dnd5e.spells";
    this.selectedLevel = options.selectedLevel ?? "all";
  }

  static DEFAULT_OPTIONS = {
    id: "compendium-spell-picker",
    classes: ["compendium-spell-picker"],
    position: {
      width: 550,
      height: 600
    },
    tag: "div"
  };

  static PARTS = {
    main: {
      template: "modules/npc-spell-book/templates/spell-picker.hbs"
    }
  };

  get title() {
    return `Add Spells to ${this.spellbook?.name ?? "Spellbook"}`;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    const itemPacks = game.packs.filter((p) => p.metadata.type === "Item");
    if (!itemPacks.some((p) => p.collection === this.selectedPackId) && itemPacks.length > 0) {
      this.selectedPackId = itemPacks[0].collection;
    }

    context.packs = itemPacks.map((p) => ({
      id: p.collection,
      label: `${p.metadata.label} (${p.metadata.packageName})`,
      selected: p.collection === this.selectedPackId
    }));

    context.selectedLevel = this.selectedLevel;
    context.levels = [
      { id: "all", label: "All Levels" },
      { id: "0", label: "Cantrip" },
      { id: "1", label: "1st Level" },
      { id: "2", label: "2nd Level" },
      { id: "3", label: "3rd Level" },
      { id: "4", label: "4th Level" },
      { id: "5", label: "5th Level" },
      { id: "6", label: "6th Level" },
      { id: "7", label: "7th Level" },
      { id: "8", label: "8th Level" },
      { id: "9", label: "9th Level" }
    ].map((lvl) => ({ ...lvl, selected: lvl.id === String(this.selectedLevel) }));

    const targetPack = game.packs.get(this.selectedPackId);
    let spells = [];

    if (targetPack) {
      const index = await targetPack.getIndex({ fields: ["system.level", "img"] });
      const currentSpells = getSpellbookSpells(this.spellbook);
      const existingUuids = new Set(currentSpells.map((s) => s.uuid));

      for (const entry of index) {
        if (entry.type !== "spell") continue;

        const level = Number(entry.system?.level ?? 0);
        if (this.selectedLevel !== "all" && String(level) !== String(this.selectedLevel)) {
          continue;
        }

        spells.push({
          uuid: entry.uuid,
          name: entry.name,
          img: entry.img || "icons/svg/spell-magic.svg",
          level: level,
          inBook: existingUuids.has(entry.uuid)
        });
      }
    }

    spells.sort((a, b) => a.name.localeCompare(b.name));
    context.spells = spells;
    context.hasSpells = spells.length > 0;

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    const packSelect = html.querySelector("#pack-select");
    if (packSelect) {
      packSelect.addEventListener("change", (e) => {
        this.selectedPackId = e.target.value;
        this.render(false);
      });
    }

    const levelSelect = html.querySelector("#level-select");
    if (levelSelect) {
      levelSelect.addEventListener("change", (e) => {
        this.selectedLevel = e.target.value;
        this.render(false);
      });
    }

    html.querySelectorAll(".add-picker-spell-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const uuid = e.currentTarget.dataset.uuid;
        if (!uuid || !this.spellbook) return;

        const spellDoc = await fromUuid(uuid);
        if (!spellDoc) return;

        btn.disabled = true;
        await addSpellToSpellbook(this.spellbook, spellDoc);

        ui.notifications.info(`Added "${spellDoc.name}" to ${this.spellbook.name}.`);
        this.render(false);
      });
    });
  }
}
