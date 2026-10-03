import {
  MODULE_ID,
  addSpellToSpellbook,
  getSpellbookSpells,
  formatSpellEntry,
  isWizardSpell,
  getWizardSpellMembership,
  clearWizardSpellMembershipCache
} from "./data.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const FALLBACK_SCHOOLS = {
  abj: "Abjuration",
  con: "Conjuration",
  div: "Divination",
  enc: "Enchantment",
  evo: "Evocation",
  ill: "Illusion",
  nec: "Necromancy",
  trs: "Transmutation"
};

export class CompendiumSpellPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.spellbook = options.spellbook;

    if (this.spellbook?.name && this.options.window) {
      this.options.window.title = `Add Spells — ${this.spellbook.name}`;
    }

    const existing = getSpellbookSpells(this.spellbook);
    this.initialUuids = new Set(existing.map((s) => s.uuid || s._id).filter(Boolean));
    this.initialNames = new Set(
      existing.map((s) => (s.name || "").toLowerCase().trim()).filter(Boolean)
    );
    this.addedSessionUuids = new Set();
    this.addedSessionNames = new Set();

    this.selectedLevels = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    this.selectedSchools = new Set(Object.keys(CONFIG.DND5E?.spellSchools || FALLBACK_SCHOOLS));
    this.selectedPacks = null;
    this._spellPacksCache = null;
    this.searchQuery = "";
    this.collapsedLevels = new Set();
    this._searchTimer = null;
  }

  static DEFAULT_OPTIONS = {
    id: "compendium-spell-picker",
    classes: ["compendium-spell-picker", "npc-spellbook-picker"],
    tag: "div",
    position: {
      width: 1100,
      height: 700
    },
    window: {
      title: "Add Spells",
      icon: "fas fa-book-medical",
      resizable: true
    },
    actions: {
      toggleLevel: CompendiumSpellPicker._onToggleLevel,
      toggleSchool: CompendiumSpellPicker._onToggleSchool,
      togglePack: CompendiumSpellPicker._onTogglePack,
      toggleLevelGroup: CompendiumSpellPicker._onToggleLevelGroup,
      addSpell: CompendiumSpellPicker._onAddSpell
    }
  };

  static PARTS = {
    picker: {
      template: `modules/${MODULE_ID}/templates/spell-picker.hbs`
    }
  };

  async _getSpellPacks() {
    if (this._spellPacksCache) return this._spellPacksCache;

    const itemPacks = game.packs.filter((p) => p.metadata.type === "Item");
    const spellPacks = [];

    for (const pack of itemPacks) {
      const index = await pack.getIndex({ fields: ["type"] });
      if (index.some((e) => e.type === "spell")) spellPacks.push(pack);
    }

    this._spellPacksCache = spellPacks;
    return spellPacks;
  }

  _getSchoolConfig() {
    return CONFIG.DND5E?.spellSchools || FALLBACK_SCHOOLS;
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.element.addEventListener("input", (event) => {
      if (!event.target?.matches?.("[data-search-input]")) return;
      this.searchQuery = event.target.value.toLowerCase().trim();
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => this.render({ force: false }), 150);
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const spellPacks = await this._getSpellPacks();

    // Ensure wizard list cache is fresh enough for this open; rebuild if empty.
    let membership = getWizardSpellMembership();
    if (!membership) {
      clearWizardSpellMembershipCache();
      membership = getWizardSpellMembership();
    }
    if (!membership && !this._warnedMissingWizardList) {
      ui.notifications?.warn("Wizard spell list not found. Only wizard spells can be shown — check that dnd5e spell lists are loaded.");
      this._warnedMissingWizardList = true;
    }

    if (!this.selectedPacks) {
      this.selectedPacks = new Set(spellPacks.map((p) => p.collection));
    }

    // Cantrips cannot be transcribed into a spellbook (PHB 2014) — levels 1–9 only.
    context.levels = Array.from({ length: 9 }, (_, i) => {
      const level = i + 1;
      return {
        level,
        label: `Level ${level}`,
        selected: this.selectedLevels.has(level)
      };
    });

    const schoolConfig = this._getSchoolConfig();
    context.schools = Object.entries(schoolConfig).map(([key, val]) => ({
      id: key,
      label: typeof val === "string" ? val : (val.label || key),
      selected: this.selectedSchools.has(key)
    }));

    context.packs = spellPacks.map((p) => ({
      id: p.collection,
      label: p.metadata.label,
      selected: this.selectedPacks.has(p.collection)
    }));

    const bookSpells = getSpellbookSpells(this.spellbook);
    const bookUuids = new Set(bookSpells.map((s) => s.uuid || s._id).filter(Boolean));
    const bookNames = new Set(
      bookSpells.map((s) => (s.name || "").toLowerCase().trim()).filter(Boolean)
    );

    // Deduplicate across packs by level + name (case-insensitive). First match wins.
    const seenKeys = new Set();
    const allMatchingSpells = [];
    const indexFields = [
      "type",
      "img",
      "system.level",
      "system.school",
      "system.identifier",
      "system.activation",
      "system.range",
      "system.target",
      "system.duration",
      "system.components",
      "system.properties",
      "system.activities"
    ];

    for (const pack of spellPacks) {
      if (!this.selectedPacks.has(pack.collection)) continue;

      const index = await pack.getIndex({ fields: indexFields });

      for (const entry of index) {
        if (entry.type !== "spell") continue;

        const level = Number(entry.system?.level ?? 0);
        const school = entry.system?.school || "";
        const name = entry.name || "";
        const nameKey = name.toLowerCase().trim();
        const uuid = entry.uuid || `Compendium.${pack.collection}.Item.${entry._id}`;
        const dedupeKey = `${level}|${nameKey}`;

        if (level < 1 || !this.selectedLevels.has(level)) continue;
        if (school && !this.selectedSchools.has(school)) continue;
        if (this.searchQuery && !nameKey.includes(this.searchQuery)) continue;
        if (!isWizardSpell({ uuid, name, level, system: entry.system })) continue;
        if (!nameKey || seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        const formatted = formatSpellEntry({
          uuid,
          name: entry.name,
          img: entry.img,
          level,
          system: entry.system
        });

        const justAdded = this.addedSessionUuids.has(uuid) || this.addedSessionNames.has(nameKey);
        const inBook = bookUuids.has(uuid)
          || this.initialUuids.has(uuid)
          || bookNames.has(nameKey)
          || this.initialNames.has(nameKey);

        allMatchingSpells.push({
          ...formatted,
          isPresent: inBook && !justAdded,
          isAdded: justAdded
        });
      }
    }

    allMatchingSpells.sort((a, b) => a.name.localeCompare(b.name));

    const levelMap = {};
    for (const spell of allMatchingSpells) {
      const lvl = spell.level;
      if (!levelMap[lvl]) {
        levelMap[lvl] = {
          label: lvl === 0 ? "CANTRIPS" : `LEVEL ${lvl}`,
          level: lvl,
          collapsed: this.collapsedLevels.has(lvl),
          spells: []
        };
      }
      levelMap[lvl].spells.push(spell);
    }

    context.searchQuery = this.searchQuery;
    context.spellCount = allMatchingSpells.length;
    context.activeLevels = Object.values(levelMap).sort((a, b) => a.level - b.level);
    context.hasSpells = context.activeLevels.length > 0;

    return context;
  }

  static _onToggleLevel(event, target) {
    const input = target.matches?.("input") ? target : target.querySelector?.("input");
    const level = Number(input?.dataset.level ?? target.dataset.level);
    if (Number.isNaN(level)) return;

    if (input?.type === "checkbox") {
      if (input.checked) this.selectedLevels.add(level);
      else this.selectedLevels.delete(level);
    } else if (this.selectedLevels.has(level)) this.selectedLevels.delete(level);
    else this.selectedLevels.add(level);

    this.render({ force: false });
  }

  static _onToggleSchool(event, target) {
    const input = target.matches?.("input") ? target : target.querySelector?.("input");
    const school = input?.dataset.school ?? target.dataset.school;
    if (!school) return;

    if (input?.type === "checkbox") {
      if (input.checked) this.selectedSchools.add(school);
      else this.selectedSchools.delete(school);
    } else if (this.selectedSchools.has(school)) this.selectedSchools.delete(school);
    else this.selectedSchools.add(school);

    this.render({ force: false });
  }

  static _onTogglePack(event, target) {
    const input = target.matches?.("input") ? target : target.querySelector?.("input");
    const pack = input?.dataset.pack ?? target.dataset.pack;
    if (!pack || !this.selectedPacks) return;

    if (input?.type === "checkbox") {
      if (input.checked) this.selectedPacks.add(pack);
      else this.selectedPacks.delete(pack);
    } else if (this.selectedPacks.has(pack)) this.selectedPacks.delete(pack);
    else this.selectedPacks.add(pack);

    this.render({ force: false });
  }

  static _onToggleLevelGroup(event, target) {
    event.preventDefault();
    const level = Number(target.dataset.level);
    if (Number.isNaN(level)) return;

    if (this.collapsedLevels.has(level)) this.collapsedLevels.delete(level);
    else this.collapsedLevels.add(level);

    this.render({ force: false });
  }

  static async _onAddSpell(event, target) {
    event.preventDefault();
    const uuid = target.dataset.uuid;
    if (!uuid || !this.spellbook) return;

    const scrollContainer = this.element?.querySelector(".spell-picker-scroll-container");
    const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

    await addSpellToSpellbook(this.spellbook, uuid);
    this.addedSessionUuids.add(uuid);

    const spellName = (target.dataset.name || "").toLowerCase().trim();
    if (spellName) this.addedSessionNames.add(spellName);

    await this.render({ force: false });

    const restored = this.element?.querySelector(".spell-picker-scroll-container");
    if (restored) restored.scrollTop = scrollTop;

    const sheet = this.spellbook.sheet;
    if (sheet?.rendered) sheet.render(false);
  }
}
