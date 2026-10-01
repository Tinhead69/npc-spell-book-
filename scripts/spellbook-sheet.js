/**
 * Primary Item Sheet for the Spellbook Item
 */
export class SpellbookItemSheet extends dnd5e.applications.item.ItemSheet5e2 {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["dnd5e", "sheet", "item", "npc-spellbook-sheet"]
    });
  }

  /**
   * Action event listeners for sheet UI
   */
  activateListeners(html) {
    super.activateListeners(html);

    // Open spell picker dialog when clicking a button with class .open-spell-picker
    html.find(".open-spell-picker").click((ev) => {
      ev.preventDefault();
      new CompendiumPickerDialog({ document: this.document }).render(true);
    });
  }
}

/**
 * ApplicationV2 Compendium Picker Dialog
 */
export class CompendiumPickerDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(options = {}) {
    super(options);
    this.itemDocument = options.document;
    this.selectedPacks = new Set();
    this.cachedSpells = [];
  }

  static DEFAULT_OPTIONS = {
    id: "compendium-picker-dialog",
    classes: ["npc-spellbook", "compendium-picker"],
    tag: "form",
    window: {
      title: "NPC Spellbook - Select Spells",
      icon: "fas fa-book-spells",
      resizable: true
    },
    position: {
      width: 650,
      height: 700
    },
    form: {
      handler: CompendiumPickerDialog._onSubmitForm,
      submitOnChange: false,
      closeOnSubmit: true
    }
  };

  static PARTS = {
    form: {
      template: "modules/npc-spellbook/templates/compendium-picker.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.compendiums = game.packs
      .filter((pack) => pack.metadata.type === "Item" && (game.user.isGM || pack.visible))
      .map((pack) => ({
        id: pack.collection,
        label: pack.metadata.label,
        selected: this.selectedPacks.has(pack.collection)
      }));

    await this._loadSpellsFromSelectedPacks();

    context.spells = this.cachedSpells;
    context.selectedCount = this.selectedPacks.size;
    context.spellCount = this.cachedSpells.length;

    return context;
  }

  async _loadSpellsFromSelectedPacks() {
    this.cachedSpells = [];
    if (this.selectedPacks.size === 0) return;

    let rulesetPref = "2024";
    try {
      rulesetPref = game.settings.get("npc-spellbook", "rulesetPreference") ?? "2024";
    } catch (e) {}

    for (const packId of this.selectedPacks) {
      const pack = game.packs.get(packId);
      if (!pack || (!game.user.isGM && !pack.visible)) continue;

      const docs = await pack.getDocuments();

      for (const item of docs) {
        if (item.type !== "spell") continue;

        const level = Number(item.system?.level ?? 0);
        if (level === 0) continue; // Skip cantrips

        const slug = item.name.toLowerCase().replace(/[^a-z0-9]/g, "");

        // Dynamic Wizard Check
        const ddbClasses = item.flags?.ddbimporter?.dndbeyond?.classes ?? [];
        const systemClasses = item.system?.classes ?? [];
        const isWizard =
          ddbClasses.some((c) => (typeof c === "string" ? c : c.name || "").toLowerCase().includes("wizard")) ||
          (Array.isArray(systemClasses) && systemClasses.some((c) => String(c).toLowerCase().includes("wizard"))) ||
          Boolean(CONFIG.DND5E?.spellComps?.wizard?.has?.(slug)) ||
          Boolean(CONFIG.DND5E?.CLASS_SPELLS?.wizard?.includes?.(slug));

        if (!isWizard) continue;

        // Dynamic Ruleset Check
        const isLegacy =
          item.name.includes("(Legacy)") ||
          item.system?.source?.rules === "2014" ||
          (item.system?.source?.book ?? "").includes("2014");

        const rulesVersion = isLegacy ? "2014" : "2024";
        if (rulesetPref !== "both" && rulesVersion !== rulesetPref) continue;

        this.cachedSpells.push({
          id: item.id,
          uuid: item.uuid,
          name: item.name,
          img: item.img,
          level: level,
          school: item.system?.school ?? "",
          source: item.system?.source?.book || pack.metadata.label,
          rulesVersion: rulesVersion,
          packTitle: pack.metadata.label
        });
      }
    }

    this.cachedSpells.sort((a, b) => a.name.localeCompare(b.name));
  }

  _onRender(context, options) {
    super._onRender(context, options);

    this.element.querySelectorAll('.pack-checkbox input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener("change", (event) => {
        const packId = event.target.dataset.packId || event.target.value;
        if (event.target.checked) {
          this.selectedPacks.add(packId);
        } else {
          this.selectedPacks.delete(packId);
        }
        this.render();
      });
    });
  }

  static async _onSubmitForm(event, form, formData) {
    event.preventDefault();
    let selectedSpellUuids = [];
    if (typeof formData.getAll === "function") {
      selectedSpellUuids = formData.getAll("selectedSpells");
    } else if (formData.object?.selectedSpells) {
      const val = formData.object.selectedSpells;
      selectedSpellUuids = Array.isArray(val) ? val : [val];
    }

    Hooks.callAll("npcSpellbookSpellsSelected", selectedSpellUuids, this.itemDocument);
  }
}
