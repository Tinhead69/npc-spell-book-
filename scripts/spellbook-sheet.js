import * as Data from "./data.js";
import { StudySpellbookDialog } from "./learn-dialog.js";

const { ItemSheetV2 } = foundry.applications.sheets;
const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * Custom Browser Dialog featuring a 2-column layout:
 * - Left Top: Filter by Spell Level (1st–9th) & School of Magic
 * - Left Bottom: Select Compendiums
 * - Right Main: Compact Wizard Spell List with individual Add buttons
 */
class CompendiumPickerDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.spellbook = options.spellbook;
    this.onImportComplete = options.onImportComplete;
    this.cachedSpells = []; // Stores indexed/loaded wizard spells

    // Default: ALL boxes are unticked
    this.selectedPacks = new Set();
    this.selectedLevels = new Set();
    this.selectedSchools = new Set();
  }

  static DEFAULT_OPTIONS = {
    id: "compendium-picker-dialog",
    classes: ["compendium-picker-advanced"],
    position: { width: 880, height: 640 },
    tag: "div"
  };

  static PARTS = {
    body: {
      template: "modules/npc-spell-book/templates/compendium-picker.hbs" // Or inline context rendering
    }
  };

  get title() {
    return "Wizard Spell & Compendium Browser";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // 1. Identify valid Compendiums
    const itemPacks = game.packs.filter((p) => p.metadata.type === "Item");
    const validPacks = [];

    for (const pack of itemPacks) {
      const index = await pack.getIndex({ fields: ["type"] });
      const hasSpells = index.some((i) => i.type === "spell");

      if (hasSpells) {
        validPacks.push({
          collection: pack.collection,
          title: pack.metadata.label,
          package: pack.metadata.packageName || "System"
        });
      }
    }

    context.packs = validPacks;

    // 2. Fetch and Cache Spells from selected compendiums
    await this._loadSpellsFromSelectedPacks();

    // 3. Filter spells based on current criteria
    context.filteredSpells = this._getFilteredSpells();
    context.selectedLevels = Array.from(this.selectedLevels);
    context.selectedSchools = Array.from(this.selectedSchools);
    context.selectedPacks = Array.from(this.selectedPacks);

    context.schoolsList = [
      { id: "abj", label: "Abjuration" },
      { id: "con", label: "Conjuration" },
      { id: "div", label: "Divination" },
      { id: "enc", label: "Enchantment" },
      { id: "evo", label: "Evocation" },
      { id: "ill", label: "Illusion" },
      { id: "nec", label: "Necromancy" },
      { id: "trs", label: "Transmutation" }
    ];

    context.levelsList = [
      { id: 1, label: "1st Lvl" },
      { id: 2, label: "2nd Lvl" },
      { id: 3, label: "3rd Lvl" },
      { id: 4, label: "4th Lvl" },
      { id: 5, label: "5th Lvl" },
      { id: 6, label: "6th Lvl" },
      { id: 7, label: "7th Lvl" },
      { id: 8, label: "8th Lvl" },
      { id: 9, label: "9th Lvl" }
    ];

    return context;
  }

  async _loadSpellsFromSelectedPacks() {
    this.cachedSpells = [];
    if (this.selectedPacks.size === 0) return;

    for (const packId of this.selectedPacks) {
      const pack = game.packs.get(packId);
      if (!pack) continue;

      const docs = await pack.getDocuments();

      for (const item of docs) {
        if (item.type !== "spell") continue;

        const level = Number(item.system?.level ?? 0);
        if (level === 0) continue; // Exclude cantrips

        const sourceItem = item.system?.sourceItem ?? item.system?._source?.sourceClass ?? "";
        const spellcastingClass = item.system?.spellcastingClass ?? item.labels?.spellcastingClass ?? "";
        const classes = Array.isArray(item.system?.classes) ? item.system.classes : Array.from(item.system?.classes ?? []);

        const isWizardSpell =
          sourceItem.toLowerCase().includes("wizard") ||
          spellcastingClass.toLowerCase().includes("wizard") ||
          classes.some((c) => String(c).toLowerCase().includes("wizard")) ||
          item.system?.properties?.has?.("wizard") ||
          item.system?.school;

        if (isWizardSpell) {
          this.cachedSpells.push({
            id: item.id,
            uuid: item.uuid,
            name: item.name,
            img: item.img,
            level: level,
            school: item.system?.school ?? "",
            components: item.labels?.components?.vsm ?? "",
            packTitle: pack.metadata.label,
            itemDoc: item
          });
        }
      }
    }
  }

  _getFilteredSpells() {
    if (this.selectedLevels.size === 0 || this.selectedSchools.size === 0 || this.selectedPacks.size === 0) {
      return [];
    }

    return this.cachedSpells.filter((spell) => {
      const matchLevel = this.selectedLevels.has(spell.level);
      const matchSchool = this.selectedSchools.has(spell.school.toLowerCase());
      return matchLevel && matchSchool;
    });
  }

  async _renderHTML(context, options) {
    const templateSource = `
      <div style="display: flex; height: 580px; width: 100%; gap: 10px; padding: 6px; font-family: Roboto, sans-serif;">
        
        <!-- LEFT COLUMN -->
        <div style="width: 280px; display: flex; flex-direction: column; gap: 8px; height: 100%;">
          
          <!-- TOP LEFT: LEVEL & SCHOOL FILTERS -->
          <div style="flex: 1.2; border: 1px solid #7a7971; border-radius: 4px; padding: 8px; background: rgba(0,0,0,0.05); overflow-y: auto;">
            <h5 style="margin: 0 0 6px 0; border-bottom: 1px solid #ccc; padding-bottom: 3px; font-size: 12px; font-weight: bold; text-transform: uppercase;">
              <i class="fas fa-filter"></i> Spell Filters
            </h5>
            
            <strong style="font-size: 11px; text-transform: uppercase; color: #444; display: block; margin-bottom: 4px;">Spell Level</strong>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; margin-bottom: 8px; font-size: 12px;">
              {{#each levelsList}}
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; line-height: 1.2;">
                  <input type="checkbox" class="filter-level" value="{{this.id}}" style="width: 14px; height: 14px; margin: 0; flex-shrink: 0;" {{#if (includes ../selectedLevels this.id)}}checked{{/if}} />
                  <span>{{this.label}}</span>
                </label>
              {{/each}}
            </div>

            <strong style="font-size: 11px; text-transform: uppercase; color: #444; display: block; margin-bottom: 4px;">School of Magic</strong>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; font-size: 12px;">
              {{#each schoolsList}}
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; line-height: 1.2;">
                  <input type="checkbox" class="filter-school" value="{{this.id}}" style="width: 14px; height: 14px; margin: 0; flex-shrink: 0;" {{#if (includes ../selectedSchools this.id)}}checked{{/if}} />
                  <span>{{this.label}}</span>
                </label>
              {{/each}}
            </div>
          </div>

          <!-- BOTTOM LEFT: COMPENDIUM SELECTOR -->
          <div style="flex: 1; border: 1px solid #7a7971; border-radius: 4px; padding: 8px; background: rgba(0,0,0,0.05); overflow-y: auto;">
            <h5 style="margin: 0 0 6px 0; border-bottom: 1px solid #ccc; padding-bottom: 3px; font-size: 12px; font-weight: bold; text-transform: uppercase;">
              <i class="fas fa-atlas"></i> Compendiums
            </h5>
            <div style="display: flex; flex-direction: column; gap: 5px; font-size: 11px;">
              {{#each packs}}
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; line-height: 1.2;">
                  <input type="checkbox" class="filter-pack" value="{{this.collection}}" style="width: 14px; height: 14px; margin: 0; flex-shrink: 0;" {{#if (includes ../selectedPacks this.collection)}}checked{{/if}} />
                  <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    <strong style="font-size: 11px;">{{this.title}}</strong> <small style="opacity:0.75; font-size: 10px;">({{this.package}})</small>
                  </span>
                </label>
              {{/each}}
            </div>
          </div>

        </div>

        <!-- RIGHT MAIN COLUMN: SPELL LIST -->
        <div style="flex: 1; border: 1px solid #7a7971; border-radius: 4px; padding: 8px; display: flex; flex-direction: column; background: rgba(0,0,0,0.02);">
          <div style="border-bottom: 1px solid #ccc; padding-bottom: 6px; margin-bottom: 8px;">
            <h4 style="margin: 0; font-size: 13px; font-weight: bold;"><i class="fas fa-list"></i> Wizard Spells ({{filteredSpells.length}})</h4>
          </div>

          <div class="spell-list" style="flex: 1; overflow-y: auto;">
            {{#if filteredSpells.length}}
              <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px;">
                {{#each filteredSpells}}
                  <li style="display: flex; align-items: center; gap: 8px; border: 1px solid rgba(0,0,0,0.15); padding: 4px 8px; border-radius: 4px; background: rgba(255,255,255,0.4);">
                    <img src="{{this.img}}" width="28" height="28" style="border: none; border-radius: 3px;" />
                    <div style="flex: 1; line-height: 1.2; overflow: hidden;">
                      <div style="font-size: 12px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{this.name}}</div>
                      <div style="font-size: 10px; opacity: 0.8;">Lvl {{this.level}} • {{this.school}} • {{this.packTitle}}</div>
                    </div>
                    <button type="button" class="add-single-spell" data-uuid="{{this.uuid}}" style="width: auto; padding: 3px 8px; font-size: 11px; line-height: 1.2;">
                      <i class="fas fa-plus"></i> Add
                    </button>
                  </li>
                {{/each}}
              </ul>
            {{else}}
              <div style="text-align: center; margin-top: 50px; opacity: 0.7; font-size: 12px;">Select filters and compendiums on the left to browse spells.</div>
            {{/if}}
          </div>
        </div>

      </div>
    `;

    const helpers = {
      includes: (arr, val) => Array.isArray(arr) && arr.includes(val)
    };

    const compiled = Handlebars.compile(templateSource);
    return compiled(context, { helpers });
  }

  _replaceHTML(result, content, options) {
    content.innerHTML = result;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    // Level Filter Listeners
    html.querySelectorAll(".filter-level").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const val = Number(e.target.value);
        if (e.target.checked) this.selectedLevels.add(val);
        else this.selectedLevels.delete(val);
        this.render(false);
      });
    });

    // School Filter Listeners
    html.querySelectorAll(".filter-school").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const val = e.target.value;
        if (e.target.checked) this.selectedSchools.add(val);
        else this.selectedSchools.delete(val);
        this.render(false);
      });
    });

    // Pack Filter Listeners
    html.querySelectorAll(".filter-pack").forEach((cb) => {
      cb.addEventListener("change", async (e) => {
        const val = e.target.value;
        if (e.target.checked) this.selectedPacks.add(val);
        else this.selectedPacks.delete(val);
        this.render(false);
      });
    });

    // Add Single Spell Handler
    html.querySelectorAll(".add-single-spell").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const uuid = e.currentTarget.dataset.uuid;
        const item = await fromUuid(uuid);
        if (item) {
          await this._addSpellsToSpellbook([item]);
        }
      });
    });
  }

  async _addSpellsToSpellbook(items) {
    if (!items.length) return;

    let existingSpells = Data.getSpellbookSpells(this.spellbook);
    let addedCount = 0;

    for (const item of items) {
      const level = Number(item.system?.level ?? 0);
      if (level === 0) {
        ui.notifications.warn(`"${item.name}" is a cantrip and cannot be added to a spellbook.`);
        continue;
      }

      const isDuplicate = existingSpells.some(
        (s) => s.uuid === item.uuid || (s.name.toLowerCase() === item.name.toLowerCase() && Number(s.level) === level)
      );

      if (!isDuplicate) {
        existingSpells.push({
          id: item.id ?? foundry.utils.randomID(),
          uuid: item.uuid,
          name: item.name,
          img: item.img,
          level: level,
          components: item.labels?.components?.vsm ?? ""
        });
        addedCount++;
      }
    }

    if (addedCount > 0) {
      await Data.setSpellbookSpells(this.spellbook, existingSpells);
      ui.notifications.info(`Added ${addedCount} spell(s) to ${this.spellbook.name}.`);
      if (this.onImportComplete) this.onImportComplete();
    } else {
      ui.notifications.warn("Selected spell is already in this spellbook.");
    }
  }
}

export class NpcSpellbookSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["npc-spellbook", "sheet", "item"],
    position: {
      width: 600,
      height: 650
    },
    form: {
      handler: NpcSpellbookSheet._onSubmitForm,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      deleteSpell: NpcSpellbookSheet._onDeleteSpell,
      studySpellbook: NpcSpellbookSheet._onStudySpellbook,
      clearSpellbook: NpcSpellbookSheet._onClearSpellbook
    }
  };

  static PARTS = {
    body: {
      template: "modules/npc-spell-book/templates/spellbook-sheet.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.document;
    context.isGM = game.user.isGM;

    let spells = Data.getSpellbookSpells ? Data.getSpellbookSpells(this.document) : [];

    // Automatic Duplicate Deduplication
    const seenKeys = new Set();
    const cleanSpells = [];
    let hasDuplicates = false;

    for (const spell of spells) {
      const key = spell.uuid ? spell.uuid : `${spell.name?.toLowerCase()}-${spell.level}`;

      if (seenKeys.has(key)) {
        hasDuplicates = true;
      } else {
        seenKeys.add(key);
        cleanSpells.push(spell);
      }
    }

    if (hasDuplicates && Data.setSpellbookSpells) {
      spells = cleanSpells;
      await Data.setSpellbookSpells(this.document, cleanSpells);
      ui.notifications.info(`Cleaned up duplicate spells in ${this.document.name}.`);
    }

    const levels = {};
    for (const spell of spells) {
      const lvl = Number(spell.level ?? 0);
      if (!levels[lvl]) levels[lvl] = [];
      levels[lvl].push(spell);
    }
    context.spellLevels = levels;

    return context;
  }

  static async _onSubmitForm(event, form, formData) {
    await this.document.update(formData.object);
  }

  static async _onDeleteSpell(event, target) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const element = target.closest("[data-spell-id]") || target.closest("[data-spell-name]") || target;
    const spellId = element?.dataset?.spellId;
    const spellName = element?.dataset?.spellName;

    if (!Data.getSpellbookSpells || !Data.setSpellbookSpells) return;

    let spells = Data.getSpellbookSpells(this.document);

    const initialCount = spells.length;
    spells = spells.filter((s) => {
      if (spellId && (s.id === spellId || s.uuid === spellId)) return false;
      if (spellName && s.name?.toLowerCase() === spellName.toLowerCase()) return false;
      return true;
    });

    if (spells.length < initialCount) {
      await Data.setSpellbookSpells(this.document, spells);
      this.render(false);
    }
  }

  static async _onClearSpellbook(event, target) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const spells = Data.getSpellbookSpells ? Data.getSpellbookSpells(this.document) : [];
    if (!spells.length) {
      ui.notifications.info("This spellbook is already empty.");
      return;
    }

    const confirm = await DialogV2.confirm({
      window: { title: "Clear Spellbook" },
      content: `<p>Are you sure you want to remove all <strong>${spells.length}</strong> spell(s) from <em>${this.document.name}</em>?</p>`,
      rejectClose: false,
      modal: true
    });

    if (confirm) {
      await Data.setSpellbookSpells(this.document, []);
      ui.notifications.info(`Cleared all spells from ${this.document.name}.`);
      this.render(false);
    }
  }

  static async _onStudySpellbook(event, target) {
    try {
      new StudySpellbookDialog({ spellbook: this.document }).render(true);
    } catch (err) {
      console.error("NPC Spellbook | Failed to open Study Dialog:", err);
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const html = this.element;

    // Add Spell Button listener
    html.querySelectorAll(".add-spell, .add-spell-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        new CompendiumPickerDialog({
          spellbook: this.document,
          onImportComplete: () => this.render(false)
        }).render(true);
      });
    });

    // Clear Spellbook Button listener
    html.querySelectorAll(".clear-spellbook-btn, [data-action='clearSpellbook']").forEach((btn) => {
      btn.addEventListener("click", (e) => NpcSpellbookSheet._onClearSpellbook.call(this, e, e.currentTarget));
    });

    // Delete Spell Button listeners
    html.querySelectorAll(".delete-spell, .spell-delete, [data-action='deleteSpell'], .fa-trash, .fa-trash-can").forEach((btn) => {
      btn.addEventListener("click", (e) => NpcSpellbookSheet._onDeleteSpell.call(this, e, e.currentTarget));
    });

    // Drag & Drop Listener
    if (this._dropHandler) {
      html.removeEventListener("drop", this._dropHandler);
    }

    this._dropHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      let data;
      try {
        data = JSON.parse(e.dataTransfer.getData("text/plain"));
      } catch (err) {
        return;
      }

      if (data?.type === "Item") {
        const item = await Item.implementation.fromDropData(data);
        if (item && item.type === "spell") {
          const level = Number(item.system?.level ?? 0);
          if (level === 0) {
            ui.notifications.warn(`"${item.name}" is a cantrip. Cantrips cannot be written into a spellbook.`);
            return;
          }

          const existing = Data.getSpellbookSpells(this.document);

          const isDuplicate = existing.some((s) => s.uuid === item.uuid || (s.name.toLowerCase() === item.name.toLowerCase() && Number(s.level) === level));
          if (isDuplicate) {
            ui.notifications.warn(`"${item.name}" is already in this spellbook.`);
            return;
          }

          if (typeof Data.addSpellToSpellbook === "function") {
            await Data.addSpellToSpellbook(this.document, item);
          } else if (typeof Data.getSpellbookSpells === "function" && typeof Data.setSpellbookSpells === "function") {
            existing.push({
              id: item.id ?? foundry.utils.randomID(),
              uuid: item.uuid,
              name: item.name,
              img: item.img,
              level: level,
              components: item.labels?.components?.vsm ?? ""
            });
            await Data.setSpellbookSpells(this.document, existing);
          }
          this.render(false);
        } else {
          ui.notifications.warn("Only 1st level or higher spells can be added to a spellbook.");
        }
      }
    };

    html.addEventListener("dragover", (e) => e.preventDefault());
    html.addEventListener("drop", this._dropHandler);
  }
}
