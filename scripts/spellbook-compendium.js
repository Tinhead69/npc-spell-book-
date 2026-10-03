import {
  MODULE_ID,
  HOMEBREW_PACK_ID,
  addSpellToSpellbook,
  getSpellbookSpells,
  getWorldHomebrewSpells,
  markSpellAsWizard,
  formatSpellEntry,
  isWizardSpell,
  getWizardSpellMembership,
  clearWizardSpellMembershipCache,
  getSpellRulesVersion
} from "./data.js";
import { bindSpellDescriptionTooltips, clearSpellTooltip } from "./spell-tooltip.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

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

  /** Normalize a Foundry index/Collection into an array of entry objects. */
  static _getIndexEntries(index) {
    if (!index) return [];
    if (Array.isArray(index)) return index;
    // Foundry Collection: filter(true) / contents are value arrays (never Map pairs).
    if (typeof index.filter === "function") return index.filter(() => true);
    if (Array.isArray(index.contents)) return index.contents;
    if (typeof index.values === "function") return Array.from(index.values());
    return [];
  }

  /** True when this Item pack contains at least one Wizard spell (levels 1–9). */
  static async _packContainsWizardSpells(pack) {
    const index = await pack.getIndex({
      fields: ["type", "system.level", "system.school", "system.identifier"]
    });
    const entries = CompendiumSpellPicker._getIndexEntries(index);

    for (const entry of entries) {
      if (entry?.type !== "spell") continue;

      const level = Number(entry.system?.level ?? entry["system.level"] ?? NaN);
      if (!Number.isFinite(level) || level < 1 || level > 9) continue;

      const identifier = entry.system?.identifier ?? entry["system.identifier"] ?? "";
      const school = entry.system?.school ?? entry["system.school"] ?? "";
      const uuid = entry.uuid || `Compendium.${pack.collection}.Item.${entry._id}`;

      if (isWizardSpell({
        uuid,
        name: entry.name,
        level,
        system: { level, identifier, school }
      })) {
        return true;
      }
    }

    return false;
  }

  /** Item compendiums that contain at least one Wizard spell. */
  async _getSpellPacks() {
    if (this._spellPacksCache) return this._spellPacksCache;

    // Warm the wizard list cache before scanning packs.
    getWizardSpellMembership();

    const itemPacks = game.packs.filter((p) =>
      (p.documentName || p.metadata?.type) === "Item"
    );
    const spellPacks = [];

    for (const pack of itemPacks) {
      try {
        if (await CompendiumSpellPicker._packContainsWizardSpells(pack)) spellPacks.push(pack);
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

  /** Package / module id for a compendium pack. */
  static _packPackageId(pack) {
    return pack?.metadata?.packageName
      || pack?.metadata?.package
      || String(pack?.collection || "").split(".")[0]
      || pack?.collection;
  }

  /** True for CPR / Chris's Premades packs (normal, 2024, third-party, etc.). */
  static _isCprPack(pack) {
    const packageId = CompendiumSpellPicker._packPackageId(pack);
    if (packageId === "chris-premades") return true;
    const haystack = `${pack.collection} ${pack.metadata?.label || ""}`.toLowerCase();
    return /\bcpr\b/.test(haystack) || /chris.?premades?/.test(haystack);
  }

  /** True for GPS / Gambit's Premades packs (core, homebrew, 3rd party, etc.). */
  static _isGpsPack(pack) {
    const packageId = CompendiumSpellPicker._packPackageId(pack);
    if (packageId === "gambits-premades") return true;
    const haystack = `${pack.collection} ${pack.metadata?.label || ""}`.toLowerCase();
    return /\bgps\b/.test(haystack) || /gambit.?s?\s*premades?/.test(haystack);
  }

  static _makePackGroup(id, label, packs) {
    const packIds = packs.map((p) => p.collection);
    const memberLabels = packs.map((p) => p.metadata?.label || p.collection);
    return {
      id,
      label,
      packIds,
      packIdsJoined: packIds.join(","),
      title: memberLabels.join(", ")
    };
  }

  /**
   * UI rows for the compendium list.
   * CPR and GPS each collapse to one checkbox covering all their spell packs.
   * Homebrew (world Items) is always offered when any world spells exist.
   */
  static _buildPackGroups(spellPacks, { includeHomebrew = false } = {}) {
    const cprPacks = [];
    const gpsPacks = [];
    const otherPacks = [];

    for (const pack of spellPacks) {
      if (CompendiumSpellPicker._isCprPack(pack)) cprPacks.push(pack);
      else if (CompendiumSpellPicker._isGpsPack(pack)) gpsPacks.push(pack);
      else otherPacks.push(pack);
    }

    const groups = [];

    if (includeHomebrew) {
      groups.push({
        id: HOMEBREW_PACK_ID,
        label: "Homebrew",
        packIds: [HOMEBREW_PACK_ID],
        packIdsJoined: HOMEBREW_PACK_ID,
        title: "World Items directory spells (GM marks wizard spells)"
      });
    }

    if (cprPacks.length) {
      groups.push(CompendiumSpellPicker._makePackGroup(
        "pkg:chris-premades",
        "Cauldron of Plentiful Resources",
        cprPacks
      ));
    }

    if (gpsPacks.length) {
      groups.push(CompendiumSpellPicker._makePackGroup(
        "pkg:gambits-premades",
        "Gambits Premades",
        gpsPacks
      ));
    }

    for (const pack of otherPacks) {
      groups.push({
        id: pack.collection,
        label: pack.metadata?.label || pack.collection,
        packIds: [pack.collection],
        packIdsJoined: pack.collection,
        title: pack.metadata?.label || pack.collection
      });
    }

    // Keep Homebrew pinned at the top; sort the rest.
    const homebrew = groups.filter((g) => g.id === HOMEBREW_PACK_ID);
    const rest = groups.filter((g) => g.id !== HOMEBREW_PACK_ID)
      .sort((a, b) => a.label.localeCompare(b.label));
    return [...homebrew, ...rest];
  }

  /**
   * Ask the GM which untagged world spells should count as wizard spells.
   * @param {Item[]} candidates
   * @returns {Promise<string[]|null>} Selected UUIDs, or null if cancelled
   */
  static async _promptMarkHomebrewWizardSpells(candidates) {
    if (!candidates?.length) return [];

    const escape = foundry.utils.escapeHTML?.bind(foundry.utils)
      || ((s) => String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      }[c])));

    const rows = candidates
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map((spell) => {
        const level = Number(spell.system?.level ?? 0);
        const img = spell.img || "icons/svg/book.svg";
        return `
          <label class="npc-homebrew-tag-row">
            <input type="checkbox" name="hb-spell" value="${escape(spell.uuid)}" />
            <img src="${escape(img)}" alt="" width="24" height="24" />
            <span class="npc-homebrew-tag-name">${escape(spell.name)}</span>
            <span class="npc-homebrew-tag-level">Lvl ${level}</span>
          </label>
        `;
      })
      .join("");

    const content = `
      <div class="npc-homebrew-tag-dialog">
        <p>These world spells are not on the wizard list. Select which ones should be treated as <strong>wizard</strong> spells for this module.</p>
        <div class="npc-homebrew-tag-list">${rows}</div>
      </div>
    `;

    let selectedUuids = null;
    try {
      await DialogV2.wait({
        window: { title: "Homebrew Wizard Spells", icon: "fas fa-hat-wizard" },
        position: { width: 480 },
        content,
        buttons: [
          {
            action: "apply",
            label: "Apply",
            icon: "fas fa-check",
            default: true,
            callback: (_event, button) => {
              const scope = button.form
                || button.closest?.(".window-content, .application, form")
                || document;
              selectedUuids = [...scope.querySelectorAll('input[name="hb-spell"]:checked')]
                .map((input) => input.value)
                .filter(Boolean);
              return selectedUuids;
            }
          },
          {
            action: "cancel",
            label: "Cancel",
            icon: "fas fa-times",
            callback: () => {
              selectedUuids = null;
              return null;
            }
          }
        ],
        rejectClose: false
      });
    } catch (_) {
      return null;
    }

    return selectedUuids;
  }

  /**
   * When enabling Homebrew: prompt for untagged world spells, then mark selected ones.
   * @returns {Promise<boolean>} false if the GM cancelled (do not enable Homebrew)
   */
  async _offerHomebrewWizardTagging() {
    if (!game.user?.isGM) {
      ui.notifications?.warn("Only the GM can enable Homebrew spells.");
      return false;
    }

    const worldSpells = getWorldHomebrewSpells();
    const untagged = worldSpells.filter((spell) => !isWizardSpell(spell));

    if (!untagged.length) return true;

    const selectedUuids = await CompendiumSpellPicker._promptMarkHomebrewWizardSpells(untagged);
    if (selectedUuids == null) return false;

    let marked = 0;
    for (const uuid of selectedUuids) {
      const doc = worldSpells.find((s) => s.uuid === uuid) || await fromUuid(uuid);
      if (!doc) continue;
      if (await markSpellAsWizard(doc)) marked += 1;
    }

    if (marked) {
      ui.notifications?.info(`Marked ${marked} homebrew spell${marked === 1 ? "" : "s"} as wizard spells.`);
    }

    return true;
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

    // Search input is destroyed on re-render — save caret so typing stays forward.
    const input = this.element?.querySelector?.("[data-search-input]");
    if (input) {
      this.searchQuery = input.value;
      this._savedSearchFocus = {
        hadFocus: document.activeElement === input,
        start: input.selectionStart ?? input.value.length,
        end: input.selectionEnd ?? input.value.length
      };
    } else {
      this._savedSearchFocus = null;
    }
  }

  _restoreScroll() {
    if (!this.element) return;
    if (this._savedScroll) {
      for (const [sel, top] of Object.entries(this._savedScroll)) {
        const el = this.element.querySelector(sel);
        if (el) el.scrollTop = top;
      }
    }

    const focus = this._savedSearchFocus;
    this._savedSearchFocus = null;
    if (!focus?.hadFocus) return;
    const input = this.element.querySelector("[data-search-input]");
    if (!input) return;
    input.focus({ preventScroll: true });
    const len = input.value.length;
    const start = Math.min(focus.start ?? len, len);
    const end = Math.min(focus.end ?? len, len);
    try {
      input.setSelectionRange(start, end);
    } catch (_) { /* ignore */ }
  }

  async _rerenderPreservingScroll() {
    this._captureScroll();
    await this.render({ force: false });
  }

  /** Lowercased query used only for filtering — display value stays as typed. */
  _getSearchNeedle() {
    return String(this.searchQuery || "").toLowerCase().trim();
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
      // Keep the raw typed value — lowercasing/trimming here + re-render resets the caret.
      this.searchQuery = event.target.value;
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

    const worldSpells = getWorldHomebrewSpells();
    const includeHomebrew = worldSpells.length > 0;

    const validPackIds = new Set(spellPacks.map((p) => p.collection));
    if (includeHomebrew) validPackIds.add(HOMEBREW_PACK_ID);

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

    const packGroups = CompendiumSpellPicker._buildPackGroups(spellPacks, { includeHomebrew });
    context.packs = packGroups.map((g) => ({
      id: g.id,
      label: g.label,
      packIds: g.packIdsJoined,
      title: g.title,
      selected: g.packIds.length > 0 && g.packIds.every((id) => this.selectedPacks.has(id))
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

    const pushMatchingSpell = (entry, { uuid, packHint = "" } = {}) => {
      if (entry?.type && entry.type !== "spell") return;

      const level = Number(entry.system?.level ?? entry.level ?? 0);
      const school = entry.system?.school || "";
      const name = entry.name || "";
      const nameKey = name.toLowerCase().trim();
      const spellUuid = uuid || entry.uuid || "";
      let rules = getSpellRulesVersion(entry);
      if (rules === "unknown" && packHint) {
        const hint = packHint.toLowerCase();
        if (hint.includes("2024")) rules = "2024";
        else if (hint.includes("2014") || hint.includes("legacy")) rules = "2014";
      }
      const dedupeKey = `${level}|${nameKey}|${rules}`;

      if (level < 1 || !this.selectedLevels.has(level)) return;
      if (school && !this.selectedSchools.has(school)) return;
      const needle = this._getSearchNeedle();
      if (needle && !nameKey.includes(needle)) return;
      if (this.rulesVersion !== "both") {
        if (rules === "unknown") {
          if (this.rulesVersion === "2024") return;
        } else if (rules !== this.rulesVersion) {
          return;
        }
      }
      const probe = (typeof entry.getFlag === "function" || entry.documentName === "Item")
        ? entry
        : { uuid: spellUuid, name, level, system: entry.system, flags: entry.flags };
      if (!isWizardSpell(probe)) return;
      if (!nameKey || seenKeys.has(dedupeKey)) return;
      seenKeys.add(dedupeKey);

      const formatted = formatSpellEntry({
        uuid: spellUuid,
        name: entry.name,
        img: entry.img,
        level,
        system: entry.system ?? entry
      });

      const justAdded = this.addedSessionUuids.has(spellUuid) || this.addedSessionNames.has(nameKey);
      const inBook = bookUuids.has(spellUuid)
        || this.initialUuids.has(spellUuid)
        || bookNames.has(nameKey)
        || this.initialNames.has(nameKey);

      allMatchingSpells.push({
        ...formatted,
        rules,
        rulesLabel: rules === "2014" ? "2014" : rules === "2024" ? "2024" : "",
        isPresent: inBook && !justAdded,
        isAdded: justAdded
      });
    };

    for (const pack of spellPacks) {
      if (!this.selectedPacks.has(pack.collection)) continue;

      const index = await pack.getIndex({ fields: indexFields });

      for (const entry of index) {
        if (entry.type !== "spell") continue;
        const uuid = entry.uuid || `Compendium.${pack.collection}.Item.${entry._id}`;
        pushMatchingSpell(entry, {
          uuid,
          packHint: `${pack.collection} ${pack.metadata?.label || ""}`
        });
      }
    }

    if (this.selectedPacks.has(HOMEBREW_PACK_ID)) {
      for (const spell of worldSpells) {
        if (!isWizardSpell(spell)) continue;
        pushMatchingSpell(spell, { uuid: spell.uuid, packHint: "homebrew" });
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
    context.filtersActive = this.selectedLevels.size > 0
      && this.selectedSchools.size > 0
      && this.selectedPacks.size > 0;

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

  static async _onTogglePack(event, target) {
    event.preventDefault();
    if (!(this.selectedPacks instanceof Set)) this.selectedPacks = new Set();

    // Grouped rows pass comma-separated pack ids (e.g. all CPR spell packs).
    const joined = target.dataset.packIds
      ?? target.querySelector?.("[data-pack-ids]")?.dataset?.packIds
      ?? "";
    const packIds = joined.split(",").map((s) => s.trim()).filter(Boolean);
    if (!packIds.length) {
      const pack = target.dataset.pack ?? target.querySelector?.("input")?.dataset?.pack;
      if (pack) packIds.push(pack);
    }
    if (!packIds.length) return;

    const allOn = packIds.every((id) => this.selectedPacks.has(id));
    if (allOn) {
      packIds.forEach((id) => this.selectedPacks.delete(id));
    } else {
      const enablingHomebrew = packIds.includes(HOMEBREW_PACK_ID)
        && !this.selectedPacks.has(HOMEBREW_PACK_ID);
      if (enablingHomebrew) {
        const ok = await this._offerHomebrewWizardTagging();
        if (!ok) {
          await this._rerenderPreservingScroll();
          return;
        }
      }
      packIds.forEach((id) => this.selectedPacks.add(id));
    }

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
    if (getWorldHomebrewSpells().length) all.push(HOMEBREW_PACK_ID);

    if (mode === "deselect") {
      this.selectedPacks = new Set();
    } else {
      const enablingHomebrew = all.includes(HOMEBREW_PACK_ID)
        && !this.selectedPacks.has(HOMEBREW_PACK_ID);
      if (enablingHomebrew) {
        const ok = await this._offerHomebrewWizardTagging();
        if (!ok) {
          // Still select non-homebrew packs if the GM cancelled tagging.
          this.selectedPacks = new Set(all.filter((id) => id !== HOMEBREW_PACK_ID));
          await this._rerenderPreservingScroll();
          return;
        }
      }
      this.selectedPacks = new Set(all);
    }
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
