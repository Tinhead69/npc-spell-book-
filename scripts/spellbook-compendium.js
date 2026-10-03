import {
  MODULE_ID,
  addSpellToSpellbook,
  getSpellbookSpells,
  formatSpellEntry,
  isWizardSpell,
  getWizardSpellMembership,
  clearWizardSpellMembershipCache,
  getSpellRulesVersion
} from "./data.js";
import { bindSpellDescriptionTooltips, clearSpellTooltip } from "./spell-tooltip.js";

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

    // Default to 2014 legacy — matches this module's PHB 2014 transcription rules.
    this.rulesVersion = "2014";

    this._tooltipTimer = null;
    this._tooltipRow = null;
    this._unbindSpellTooltips = null;
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
      setRulesVersion: CompendiumSpellPicker._onSetRulesVersion,
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

  /** Scroll containers that should keep position across filter re-renders. */
  static SCROLL_SELECTORS = [
    ".spell-picker-scroll-container",
    ".spell-picker-pack-list",
    ".spell-picker-compendiums",
    ".spell-picker-sidebar"
  ];

  _captureScroll() {
    const positions = {};
    for (const sel of CompendiumSpellPicker.SCROLL_SELECTORS) {
      const el = this.element?.querySelector(sel);
      if (el) positions[sel] = el.scrollTop;
    }
    this._savedScroll = positions;
  }

  _restoreScroll() {
    if (!this._savedScroll || !this.element) return;
    for (const [sel, top] of Object.entries(this._savedScroll)) {
      const el = this.element.querySelector(sel);
      if (el) el.scrollTop = top;
    }
  }

  async _rerenderPreservingScroll() {
    this._captureScroll();
    await this.render({ force: false });
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);

    this.element.addEventListener("input", (event) => {
      if (!event.target?.matches?.("[data-search-input]")) return;
      this.searchQuery = event.target.value.toLowerCase().trim();
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => this._rerenderPreservingScroll(), 150);
    });

    this._unbindSpellTooltips = bindSpellDescriptionTooltips(this.element, this);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender?.(context, options);
    this._restoreScroll();
  }

  /** @override */
  async close(options) {
    this._unbindSpellTooltips?.();
    this._unbindSpellTooltips = null;
    clearSpellTooltip(this, true);
    return super.close(options);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const spellPacks = await this._getSpellPacks();

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

    context.rulesOptions = [
      { id: "2014", label: "2014 (Legacy)", selected: this.rulesVersion === "2014" },
      { id: "2024", label: "2024", selected: this.rulesVersion === "2024" },
      { id: "both", label: "Both", selected: this.rulesVersion === "both" }
    ];

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

    const seenKeys = new Set();
    const allMatchingSpells = [];
    const indexFields = [
      "type",
      "img",
      "system.level",
      "system.school",
      "system.identifier",
      "system.source",
      "flags.ddbimporter",
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
        const rules = getSpellRulesVersion(entry);
        const dedupeKey = `${level}|${nameKey}|${rules}`;

        if (level < 1 || !this.selectedLevels.has(level)) continue;
        if (school && !this.selectedSchools.has(school)) continue;
        if (this.searchQuery && !nameKey.includes(this.searchQuery)) continue;
        if (this.rulesVersion !== "both") {
          if (rules === "unknown") {
            // Unknown source: include only when it doesn't contradict the selected edition.
            // Prefer excluding unknowns from strict 2024 filter; allow for 2014 (legacy default).
            if (this.rulesVersion === "2024") continue;
          } else if (rules !== this.rulesVersion) {
            continue;
          }
        }
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
          rules,
          rulesLabel: rules === "2014" ? "2014" : rules === "2024" ? "2024" : "",
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
          label: `LEVEL ${lvl}`,
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

  static _onSetRulesVersion(event, target) {
    const input = target.matches?.("input") ? target : target.querySelector?.("input");
    const rules = input?.dataset.rules ?? target.dataset.rules;
    if (!rules) return;
    this.rulesVersion = rules;
    this._rerenderPreservingScroll();
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

    this._rerenderPreservingScroll();
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

    this._rerenderPreservingScroll();
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

    this._rerenderPreservingScroll();
  }

  static _onToggleLevelGroup(event, target) {
    event.preventDefault();
    const level = Number(target.dataset.level);
    if (Number.isNaN(level)) return;

    if (this.collapsedLevels.has(level)) this.collapsedLevels.delete(level);
    else this.collapsedLevels.add(level);

    this._rerenderPreservingScroll();
  }

  static async _onAddSpell(event, target) {
    event.preventDefault();
    const uuid = target.dataset.uuid;
    if (!uuid || !this.spellbook) return;

    clearSpellTooltip(this, true);

    await addSpellToSpellbook(this.spellbook, uuid);
    this.addedSessionUuids.add(uuid);

    const spellName = (target.dataset.name || "").toLowerCase().trim();
    if (spellName) this.addedSessionNames.add(spellName);

    await this._rerenderPreservingScroll();

    const sheet = this.spellbook.sheet;
    if (sheet?.rendered) sheet.render(false);
  }
}
