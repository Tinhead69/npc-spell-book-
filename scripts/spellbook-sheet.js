import { SPELL_METADATA } from "./spell-metadata.js";

/**
 * ApplicationV2 Dialog for selecting spell compendiums and filtering spells.
 */
export class CompendiumPickerDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(options = {}) {
    super(options);
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

  /**
   * Prepares render context for the Handlebars template.
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Load available Item compendiums
    context.compendiums = game.packs
      .filter((pack) => pack.metadata.type === "Item" && (game.user.isGM || pack.visible))
      .map((pack) => ({
        id: pack.collection,
        label: pack.metadata.label,
        selected: this.selectedPacks.has(pack.collection)
      }));

    // Retrieve spells from selected compendiums
    await this._loadSpellsFromSelectedPacks();

    context.spells = this.cachedSpells;
    context.selectedCount = this.selectedPacks.size;
    context.spellCount = this.cachedSpells.length;
    context.rulesetPreference = game.settings.get("npc-spellbook", "rulesetPreference") ?? "2024";

    return context;
  }

  /**
   * Scans selected compendiums and applies Wizard + Ruleset filters.
   */
  async _loadSpellsFromSelectedPacks() {
    this.cachedSpells = [];
    if (this.selectedPacks.size === 0) return;

    const rulesetPref = game.settings.get("npc-spellbook", "rulesetPreference") ?? "2024";

    // Safe retrieval of spellcasting configuration (Fixes CONFIG.DND5E.spellcastingTypes deprecation warning in 5.1+)
    const spellcastingConfig = CONFIG.DND5E?.spellcasting ?? CONFIG.DND5E?.spellcastingTypes ?? {};

    for (const packId of this.selectedPacks) {
      const pack = game.packs.get(packId);
      if (!pack) continue;

      if (!game.user.isGM && !pack.visible) continue;

      const docs = await pack.getDocuments();

      for (const item of docs) {
        if (item.type !== "spell") continue;

        const level = Number(item.system?.level ?? 0);
        if (level === 0) continue; // Skip cantrips

        const slug = item.name.toLowerCase().replace(/[^a-z0-9]/g, "");

        // 1. Metadata / Fallback Evaluation
        let meta = SPELL_METADATA[slug];

        if (!meta) {
          // Dynamic Fallback
          const ddbClasses = item.flags?.ddbimporter?.dndbeyond?.classes ?? [];
          const isWizard =
            ddbClasses.some((c) => (c.name || c).toLowerCase().includes("wizard")) ||
            Boolean(CONFIG.DND5E?.spellComps?.wizard?.has?.(slug)) ||
            Boolean(CONFIG.DND5E?.CLASS_SPELLS?.wizard?.includes?.(slug));

          const isLegacy =
            item.name.includes("(Legacy)") ||
            item.system?.source?.rules === "2014" ||
            (item.system?.source?.book ?? "").includes("2014");

          meta = {
            name: item.name,
            isWizard: isWizard,
            rulesVersion: isLegacy ? "2014" : "2024",
            source: item.system?.source?.book || pack.metadata.label
          };
        }

        // 2. Class Filter: Wizard Only
        if (!meta.isWizard) continue;

        // 3. Ruleset Filter: 2014 vs 2024
        if (rulesetPref !== "both" && meta.rulesVersion !== rulesetPref) continue;

        // 4. Build Clean Entry
        this.cachedSpells.push({
          id: item.id,
          uuid: item.uuid,
          name: item.name,
          img: item.img,
          level: level,
          school: item.system?.school ?? "",
          source: meta.source ?? pack.metadata.label,
          rulesVersion: meta.rulesVersion ?? "2024",
          packTitle: pack.metadata.label
        });
      }
    }

    // Sort spells alphabetically by name
    this.cachedSpells.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Action event listeners for ApplicationV2.
   */
  _onRender(context, options) {
    super._onRender(context, options);

    // Compendium selection checkbox toggle
    this.element.querySelectorAll('.pack-checkbox input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener("change", (event) => {
        const packId = event.target.dataset.packId;
        if (event.target.checked) {
          this.selectedPacks.add(packId);
        } else {
          this.selectedPacks.delete(packId);
        }
        this.render();
      });
    });
  }

  /**
   * Form submission handler.
   */
  static async _onSubmitForm(event, form, formData) {
    event.preventDefault();
    const selectedSpellUuids = formData.getAll("selectedSpells");
    
    // Process selected spells (e.g., adding to actor spellbook)
    Hooks.callAll("npcSpellbookSpellsSelected", selectedSpellUuids);
  }
}
