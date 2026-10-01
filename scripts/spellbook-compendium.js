import { addSpellToSpellbook, getSpellbookSpells } from "./data.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CompendiumSpellPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.spellbook = options.spellbook;
    this.selectedPackId = options.selectedPackId ?? "dnd5e.spells";
    this.selectedLevel = options.selectedLevel ?? "1";
  }

  static DEFAULT_OPTIONS = {
    id: "compendium-spell-picker",
    classes: ["compendium-spell-picker"],
    position: {
      width: 750,
      height: 650
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
      const index = await targetPack.getIndex({
        fields: [
          "system.level",
          "img",
          "system.school",
          "system.activation",
          "system.range",
          "system.duration"
        ]
      });
      const currentSpells = getSpellbookSpells(this.spellbook);
      const existingUuids = new Set(currentSpells.map((s) => s.uuid));

      for (const entry of index) {
        if (entry.type !== "spell") continue;

        const sys = entry.system || {};
        const level = Number(sys.level ?? 0);
        
        if (level < 1) continue;
        if (this.selectedLevel !== "all" && String(level) !== String(this.selectedLevel)) {
          continue;
        }

        // School formatting
        const school = sys.school ? (CONFIG.dnd5e?.spellSchools?.[sys.school] ?? sys.school) : "—";

        // Activation / Casting Time formatting
        let time = "—";
        const activation = sys.activation;
        if (typeof activation === "string") {
          time = activation;
        } else if (activation?.type) {
          const cost = activation.cost ? `${activation.cost} ` : "";
          const typeMap = {
            action: "Action",
            bonus: "Bonus Action",
            reaction: "Reaction",
            minute: "Minute",
            hour: "Hour",
            day: "Day"
          };
          time = `${cost}${typeMap[activation.type] || activation.type}`;
        }

        // Range formatting
        let range = "—";
        const rng = sys.range;
        if (typeof rng === "string") {
          range = rng;
        } else if (rng?.units === "self") {
          range = "Self";
        } else if (rng?.units === "touch") {
          range = "Touch";
        } else if (rng?.units === "sight") {
          range = "Sight";
        } else if (rng?.value) {
          range = `${rng.value}${rng.units ? ` ${rng.units}` : ""}`;
        } else if (rng?.units) {
          range = rng.units;
        }

        // Duration formatting
        let duration = "—";
        const dur = sys.duration;
        if (typeof dur === "string") {
          duration = dur;
        } else if (dur?.units) {
          const val = dur.value ? `${dur.value} ` : "";
          const unitsMap = {
            turn: "Turn",
            round: "Round",
            minute: "Minute",
            hour: "Hour",
            day: "Day",
            permanent: "Permanent",
            instantaneous: "Instantaneous"
          };
          duration = `${val}${unitsMap[dur.units] || dur.units}`;
        }

        spells.push({
          uuid: entry.uuid,
          name: entry.name,
          img: entry.img || "icons/svg/spell-magic.svg",
          level: level,
          school,
          time,
          range,
          duration,
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
