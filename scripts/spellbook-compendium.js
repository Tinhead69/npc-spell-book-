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

/** Lightweight ApplicationV2 loading window (avoids deprecated V1 Dialog). */
class SpellLoadingApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "npc-spellbook-loading",
    classes: ["npc-spellbook-loading-dialog"],
    tag: "div",
    window: {
      title: "Loading Spells",
      icon: "fas fa-spinner",
      resizable: false,
      minimizable: false
    },
    position: { width: 320 }
  };

  constructor(message, options = {}) {
    super(options);
    this._message = message;
  }

  _renderHTML() {
    const safe = foundry.utils.escapeHTML?.(this._message) || this._message;
    return `
      <div class="npc-spellbook-loading-content">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        <p>${safe}</p>
      </div>
    `;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }
}

/** Show a loading window only if work takes longer than delayMs. */
function beginDelayedLoading(message, delayMs = 2000) {
  let app = null;
  let dismissed = false;

  const timer = setTimeout(() => {
    if (dismissed) return;
    app = new SpellLoadingApp(message);
    app.render({ force: true });
  }, delayMs);

  return {
    async dismiss() {
      dismissed = true;
      clearTimeout(timer);
      if (app?.rendered) {
        try {
          await app.close({ force: true });
        } catch (_) { /* already closed */ }
      }
      app = null;
    }
  };
}

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

    this.selectedLevels = new Set();
    this.selectedSchools = new Set();
    this.selectedPacks = new Set();
    this._spellPacksCache = null;
    this.searchQuery = "";
    this.collapsedLevels = new Set();
    this._searchTimer = null;

    // Default to 2014 legacy — matches this module's PHB 2014 transcription rules.
    this.rulesVersion = "2014";

    this._tooltipTimer = null;
    this._tooltipRow = null;
    this._unbindSpellTooltips = null;
    this._loadingHandle = null;
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
      toggleAllLevels: CompendiumSpellPicker._onToggleAllLevels,
      toggleAllSchools: CompendiumSpellPicker._onToggleAllSchools,
      toggleAllPacks: CompendiumSpellPicker._onToggleAllPacks,
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

  /**
   * True when an index entry is a real dnd5e spell (not a mis-typed feature/item).
   * Requires type, numeric level (0+), and school — equipment packs never satisfy this.
   */
  static _indexEntryIsSpell(entry) {
    if (!entry || entry.type !== "spell") return false;
    const level = Number(entry.system?.level);
    if (!Number.isFinite(level) || level < 0) return false;
    if (!entry.system?.school) return false;
    return true;
  }

  /** Item compendiums that actually contain at least one spell document. */
  async _getSpellPacks() {
    if (this._spellPacksCache) return this._spellPacksCache;

    const itemPacks = game.packs.filter((p) =>
      (p.documentName || p.metadata?.type) === "Item"
    );
    const spellPacks = [];

    for (const pack of itemPacks) {
      try {
        await pack.getIndex({ fields: ["type", "system.level", "system.school"] });
        const entries = pack.index?.contents ?? Array.from(pack.index?.values?.() ?? pack.index ?? []);
        if (entries.some((entry) => CompendiumSpellPicker._indexEntryIsSpell(entry))) {
          spellPacks.push(pack);
        }
      } catch (err) {
        console.warn(`NPC Spellbook | Skipping pack (index failed): ${pack.collection}`, err);
      }
    }

    spellPacks.sort((a, b) =>
      String(a.metadata?.label || a.collection).localeCompare(String(b.metadata?.label || b.collection))
    );

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

  /**
   * Wrap render with a delayed loading dialog for slow compendium scans.
   * @override
   */
  async render(options = {}, _options = {}) {
    const opts = typeof options === "boolean" ? { force: options, ..._options } : { ...options, ..._options };
    const firstOpen = !this.rendered;

    // Only show the loader on first open (compendium scan). Filter toggles re-render quietly.
    if (firstOpen && !this._loadingHandle) {
      this._loadingHandle = beginDelayedLoading(
        "Scanning spell compendiums… This can take a moment with large worlds.",
        2000
      );
    }

    try {
      return await super.render(opts);
    } finally {
      if (firstOpen) {
        const handle = this._loadingHandle;
        this._loadingHandle = null;
        await handle?.dismiss();
      }
    }
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
    const handle = this._loadingHandle;
    this._loadingHandle = null;
    await handle?.dismiss();
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

    const validPackIds = new Set(spellPacks.map((p) => p.collection));
    if (!(this.selectedPacks instanceof Set)) this.selectedPacks = new Set();
    // Drop stale selections for packs that have no spells (do not auto-select).
    this.selectedPacks = new Set([...this.selectedPacks].filter((id) => validPackIds.has(id)));

    context.rulesOptions = [
      { id: "2014", label: "2014 (Legacy)", selected: this.rulesVersion === "2014" },
      { id: "2024", label: "2024", selected: this.rulesVersion === "2024" },
      { id: "both", label: "Both", selected: this.rulesVersion === "both" }
    ];

    const allLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    context.levels = allLevels.map((level) => ({
      level,
      label: `Level ${level}`,
      selected: this.selectedLevels.has(level)
    }));
    context.levelsAllSelected = allLevels.every((level) => this.selectedLevels.has(level));

    const schoolConfig = this._getSchoolConfig();
    const schoolIds = Object.keys(schoolConfig);
    context.schools = schoolIds.map((key) => {
      const val = schoolConfig[key];
      return {
        id: key,
        label: typeof val === "string" ? val : (val.label || key),
        selected: this.selectedSchools.has(key)
      };
    });
    context.schoolsAllSelected = schoolIds.length > 0
      && schoolIds.every((id) => this.selectedSchools.has(id));

    context.packs = spellPacks.map((p) => ({
      id: p.collection,
      label: p.metadata.label,
      selected: this.selectedPacks.has(p.collection)
    }));
    context.packsAllSelected = validPackIds.size > 0
      && [...validPackIds].every((id) => this.selectedPacks.has(id));

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
    event.preventDefault();
    const level = Number(target.dataset.level
      ?? target.querySelector?.("input")?.dataset?.level);
    if (Number.isNaN(level)) return;

    // Toggle from stored state (do not trust checkbox.checked — AppV2 click timing varies).
    if (this.selectedLevels.has(level)) this.selectedLevels.delete(level);
    else this.selectedLevels.add(level);

    this._rerenderPreservingScroll();
  }

  static _onToggleSchool(event, target) {
    event.preventDefault();
    const school = target.dataset.school
      ?? target.querySelector?.("input")?.dataset?.school;
    if (!school) return;

    if (this.selectedSchools.has(school)) this.selectedSchools.delete(school);
    else this.selectedSchools.add(school);

    this._rerenderPreservingScroll();
  }

  static _onTogglePack(event, target) {
    event.preventDefault();
    const pack = target.dataset.pack
      ?? target.querySelector?.("input")?.dataset?.pack;
    if (!pack) return;
    if (!(this.selectedPacks instanceof Set)) this.selectedPacks = new Set();

    if (this.selectedPacks.has(pack)) this.selectedPacks.delete(pack);
    else this.selectedPacks.add(pack);

    this._rerenderPreservingScroll();
  }

  static _onToggleAllLevels(_event, target) {
    const mode = target.dataset.mode;
    const all = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    this.selectedLevels = mode === "deselect" ? new Set() : new Set(all);
    this._rerenderPreservingScroll();
  }

  static _onToggleAllSchools(_event, target) {
    const mode = target.dataset.mode;
    const all = Object.keys(this._getSchoolConfig());
    this.selectedSchools = mode === "deselect" ? new Set() : new Set(all);
    this._rerenderPreservingScroll();
  }

  static async _onToggleAllPacks(_event, target) {
    // Honor the button mode from click time so a slow await cannot flip into "select all".
    const mode = target.dataset.mode;
    const packs = await this._getSpellPacks();
    const all = packs.map((p) => p.collection);
    this.selectedPacks = mode === "deselect" ? new Set() : new Set(all);
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
