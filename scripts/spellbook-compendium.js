import { addSpellToSpellbook, getSpellbookSpells } from "./data.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CompendiumSpellPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.spellbook = options.spellbook;
    this.selectedPackId = options.selectedPackId ?? "dnd5e.spells";
  }

  static DEFAULT_OPTIONS = {
    id: "compendium-spell-picker",
    classes: ["compendium-spell-picker", "dnd5e", "sheet"],
    position: {
      width: 650,
      height: 700
    },
    tag: "div"
  };

  static PARTS = {
    main: {
      template: "modules/npc-spell-book/templates/spell-picker.hbs"
    }
  };

  get title() {
    return `Add Spells to ${this.spellbook?.name ?? "Study Spell Book"}`;
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

    const targetPack = game.packs.get(this.selectedPackId);
    
    // Initialize level groups 0 to 9
    const levelGroups = {};
    for (let i = 0; i <= 9; i++) {
      levelGroups[i] = {
        level: i,
        label: i === 0 ? "CANTRIPS" : `LEVEL ${i}`,
        spells: []
      };
    }

    if (targetPack) {
      const index = await targetPack.getIndex({
        fields: [
          "system.level",
          "img",
          "system.school",
          "system.activation",
          "system.range"
        ]
      });
      const currentSpells = getSpellbookSpells(this.spellbook);
      const existingUuids = new Set(currentSpells.map((s) => s.uuid));

      for (const entry of index) {
        if (entry.type !== "spell") continue;

        const sys = entry.system || {};
        const level = Number(sys.level ?? 0);
        if (level < 0 || level > 9) continue;

        const school = sys.school ? (CONFIG.dnd5e?.spellSchools?.[sys.school] ?? sys.school) : "—";

        let time = "—";
        const activation = sys.activation;
        if (typeof activation === "string") {
          time = activation;
        } else if (activation?.type) {
          const cost = activation.cost ? `${activation.cost} ` : "";
          const typeMap = { action: "Action", bonus: "Bonus Action", reaction: "Reaction", minute: "Minute", hour: "Hour", day: "Day" };
          time = `${cost}${typeMap[activation.type] || activation.type}`;
        }

        let range = "—";
        const rng = sys.range;
        if (typeof rng === "string") {
          range = rng;
        } else if (rng?.units === "self") {
          range = "Self";
        } else if (rng?.units === "touch") {
          range = "Touch";
        } else if (rng?.value) {
          range = `${rng.value}${rng.units ? ` ${rng.units}` : ""}`;
        } else if (rng?.units) {
          range = rng.units;
        }

        levelGroups[level].spells.push({
          uuid: entry.uuid,
          name: entry.name,
          img: entry.img || "icons/svg/spell-magic.svg",
          school,
          time,
          range,
          inBook: existingUuids.has(entry.uuid)
        });
      }
    }

    // Sort spells alphabetically within each level group
    Object.values(levelGroups).forEach(group => {
      group.spells.sort((a, b) => a.name.localeCompare(b.name));
    });

    // Filter out empty levels and sort levels numerically from 0 to 9
    context.activeLevels = Object.values(levelGroups)
      .filter((group) => group.spells.length > 0)
      .sort((a, b) => a.level - b.level);

    context.hasSpells = context.activeLevels.length > 0;

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

    html.querySelectorAll(".add-picker-spell-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const uuid = e.currentTarget.dataset.uuid;
        if (!uuid || !this.spellbook) return;

        const spellDoc = await fromUuid(uuid);
        if (!spellDoc) return;

        btn.disabled = true;
        btn.textContent = "Added";
        await addSpellToSpellbook(this.spellbook, spellDoc);

        ui.notifications.info(`Added "${spellDoc.name}" to ${this.spellbook.name}.`);
        this.render(false);
      });
    });
  }
}
