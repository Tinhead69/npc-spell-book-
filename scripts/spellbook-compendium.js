import { MODULE_ID, addSpellToSpellbook, getSpellbookSpells } from "./data.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export class CompendiumSpellPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.spellbook = options.spellbook;

    const existing = getSpellbookSpells(this.spellbook);
    this.initialUuids = new Set(existing.map((s) => s.uuid || s._id));
    this.addedSessionUuids = new Set();

    this.selectedLevels = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    this.selectedSchools = new Set(
      Object.keys(
        CONFIG.DND5E?.spellSchools || {
          abj: "Abjuration",
          con: "Conjuration",
          div: "Divination",
          enc: "Enchantment",
          evo: "Evocation",
          ill: "Illusion",
          nec: "Necromancy",
          trs: "Transmutation"
        }
      )
    );

    const availablePacks = game.packs.filter((p) => p.metadata.type === "Item");
    this.selectedPacks = new Set(availablePacks.map((p) => p.collection));
    this.searchQuery = "";
  }

  static DEFAULT_OPTIONS = {
    id: "compendium-spell-picker",
    classes: ["compendium-spell-picker"],
    position: {
      width: 850,
      height: 600
    },
    window: {
      title: "Compendium Spell Picker",
      resizable: true
    },
    actions: {
      toggleLevel: CompendiumSpellPicker._onToggleLevel,
      toggleSchool: CompendiumSpellPicker._onToggleSchool,
      togglePack: CompendiumSpellPicker._onTogglePack,
      addSpell: CompendiumSpellPicker._onAddSpell
    }
  };

  static PARTS = {
    picker: {
      template: "modules/npc-spell-book/templates/spell-picker.hbs"
    }
  };

  _onRender(context, options) {
    super._onRender(context, options);

    const searchInput = this.element.querySelector('input[data-action="searchSpells"]');
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.render();
      });
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.levels = Array.from({ length: 9 }, (_, i) => {
      const lvl = i + 1;
      return {
        level: lvl,
        label: `Level ${lvl}`,
        selected: this.selectedLevels.has(lvl)
      };
    });

    const schoolConfig = CONFIG.DND5E?.spellSchools || {
      abj: { label: "Abjuration" },
      con: { label: "Conjuration" },
      div: { label: "Divination" },
      enc: { label: "Enchantment" },
      evo: { label: "Evocation" },
      ill: { label: "Illusion" },
      nec: { label: "Necromancy" },
      trs: { label: "Transmutation" }
    };

    context.schools = Object.entries(schoolConfig).map(([key, val]) => ({
      id: key,
      label: typeof val === "string" ? val : val.label,
      selected: this.selectedSchools.has(key)
    }));

    const itemPacks = game.packs.filter((p) => p.metadata.type === "Item");
    context.packs = itemPacks.map((p) => ({
      id: p.collection,
      label: p.metadata.label,
      selected: this.selectedPacks.has(p.collection)
    }));

    const allMatchingSpells = [];
    for (const packKey of this.selectedPacks) {
      const pack = game.packs.get(packKey);
      if (!pack) continue;

      const index = await pack.getIndex({
        fields: ["system.level", "system.school", "system.activation", "system.range", "system.target"]
      });

      for (const entry of index) {
        if (entry.type !== "spell") continue;

        const level = Number(entry.system?.level ?? 0);
        const school = entry.system?.school || "";
        const name = entry.name || "";

        if (!this.selectedLevels.has(level)) continue;
        if (school && !this.selectedSchools.has(school)) continue;
        if (this.searchQuery && !name.toLowerCase().includes(this.searchQuery)) continue;

        let time = "—";
        const act = entry.system?.activation;
        if (act?.type) {
          const t = act.type.toLowerCase();
          time = t === "action" ? "A" : t === "bonus" ? "BA" : t === "reaction" ? "R" : act.type;
        }

        let range = "—";
        const rng = entry.system?.range;
        if (rng?.units === "self") range = "Self";
        else if (rng?.units === "touch") range = "Touch";
        else if (rng?.value) range = `${rng.value} ${rng.units || ""}`.trim();

        let target = "—";
        const tgt = entry.system?.target;
        if (tgt?.affects?.type) target = `${tgt.affects.value || ""} ${tgt.affects.type}`.trim();
        else if (tgt?.type) target = `${tgt.value || ""} ${tgt.type}`.trim();

        const schoolObj = schoolConfig[school];
        const schoolName = schoolObj ? (typeof schoolObj === "string" ? schoolObj : schoolObj.label) : school;

        const uuid = entry.uuid || `Compendium.${packKey}.Item.${entry._id}`;

        const isPresent = this.initialUuids.has(uuid) || this.initialUuids.has(entry._id);
        const isAdded = this.addedSessionUuids.has(uuid);

        allMatchingSpells.push({
          uuid,
          name: entry.name,
          img: entry.img,
          level,
          school,
          schoolName,
          time,
          range,
          target,
          isPresent,
          isAdded
        });
      }
    }

    const levelMap = {};
    for (let i = 1; i <= 9; i++) {
      if (this.selectedLevels.has(i)) {
        levelMap[i] = {
          label: `LEVEL ${i}`,
          level: i,
          spells: []
        };
      }
    }

    for (const spell of allMatchingSpells) {
      if (levelMap[spell.level]) {
        levelMap[spell.level].spells.push(spell);
      }
    }

    context.searchQuery = this.searchQuery;
    context.spellCount = allMatchingSpells.length;
    context.activeLevels = Object.values(levelMap)
      .filter((g) => g.spells.length > 0)
      .sort((a, b) => a.level - b.level);

    context.hasSpells = context.activeLevels.length > 0;

    return context;
  }

  static _onToggleLevel(event, target) {
    const level = Number(target.dataset.level);
    if (this.selectedLevels.has(level)) this.selectedLevels.delete(level);
    else this.selectedLevels.add(level);
    this.render();
  }

  static _onToggleSchool(event, target) {
    const school = target.dataset.school;
    if (this.selectedSchools.has(school)) this.selectedSchools.delete(school);
    else this.selectedSchools.add(school);
    this.render();
  }

  static _onTogglePack(event, target) {
    const pack = target.dataset.pack;
    if (this.selectedPacks.has(pack)) this.selectedPacks.delete(pack);
    else this.selectedPacks.add(pack);
    this.render();
  }

  static async _onAddSpell(event, target) {
    event.preventDefault();
    const uuid = target.dataset.uuid;
    if (!uuid || !this.spellbook) return;

    // Save current scroll position before re-render
    const scrollContainer = this.element?.querySelector(".spell-picker-scroll-container");
    const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

    await addSpellToSpellbook(this.spellbook, uuid);

    this.addedSessionUuids.add(uuid);

    // Re-render UI
    await this.render();

    // Restore scroll position
    const restoredContainer = this.element?.querySelector(".spell-picker-scroll-container");
    if (restoredContainer) {
      restoredContainer.scrollTop = scrollTop;
    }

    if (this.spellbook.sheet && this.spellbook.sheet.rendered) {
      this.spellbook.sheet.render();
    }
  }
}
