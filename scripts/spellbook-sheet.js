import * as Data from "./data.js";
import { StudySpellbookDialog } from "./learn-dialog.js";

const { ItemSheetV2 } = foundry.applications.sheets;
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog to select multiple compendiums containing Wizard spells and import them
 */
class CompendiumPickerDialog extends ApplicationV2 {
  constructor(options = {}) {
    super(options);
    this.spellbook = options.spellbook;
    this.onImportComplete = options.onImportComplete;
  }

  static DEFAULT_OPTIONS = {
    id: "compendium-picker-dialog",
    classes: ["compendium-picker"],
    position: { width: 460, height: 520 },
    tag: "div"
  };

  get title() {
    return "Select Wizard Spell Compendiums";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

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
    return context;
  }

  async _renderHTML(context, options) {
    const templateSource = `
      <div class="compendium-picker-content" style="padding: 12px; display: flex; flex-direction: column; height: 100%;">
        <p class="notes" style="margin-bottom: 12px; font-weight: bold;">
          <i class="fas fa-book"></i> Check the compendiums to import Wizard spells from:
        </p>
        <div class="compendium-list" style="flex: 1; max-height: 340px; overflow-y: auto; border: 1px solid #ccc; padding: 8px; border-radius: 4px; margin-bottom: 12px;">
          {{#each packs}}
            <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="pack-{{@index}}" class="pack-checkbox" value="{{this.collection}}" style="cursor: pointer;" />
              <label for="pack-{{@index}}" style="cursor: pointer; flex: 1;">
                <strong>{{this.title}}</strong> <small style="opacity: 0.7;">({{this.package}})</small>
              </label>
            </div>
          {{/each}}
        </div>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button type="button" class="select-all-btn" style="flex: 1;"><i class="fas fa-check-square"></i> Select All</button>
          <button type="button" class="import-spells-btn" style="flex: 2; font-weight: bold;"><i class="fas fa-download"></i> Import Spells</button>
        </div>
      </div>
    `;
    const compiled = Handlebars.compile(templateSource);
    return compiled(context);
  }

  _replaceHTML(result, content, options) {
    content.innerHTML = result;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const html = this.element;

    // Toggle Select All / Deselect All
    const selectAllBtn = html.querySelector(".select-all-btn");
    selectAllBtn?.addEventListener("click", () => {
      const checkboxes = html.querySelectorAll(".pack-checkbox");
      const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
      checkboxes.forEach((cb) => (cb.checked = !allChecked));
    });

    // Import Spells Handler
    const importBtn = html.querySelector(".import-spells-btn");
    importBtn?.addEventListener("click", async () => {
      const checkedPacks = Array.from(html.querySelectorAll(".pack-checkbox:checked")).map((cb) => cb.value);

      if (checkedPacks.length === 0) {
        ui.notifications.warn("Please select at least one compendium.");
        return;
      }

      let addedCount = 0;
      let existingSpells = Data.getSpellbookSpells(this.spellbook);

      for (const packId of checkedPacks) {
        const pack = game.packs.get(packId);
        if (!pack) continue;

        // Fetch documents from pack
        const documents = await pack.getDocuments();

        for (const item of documents) {
          // Verify item is a spell
          if (item.type !== "spell") continue;

          // Check if it's a wizard spell (handles dnd5e spell filtering)
          const isWizardSpell = 
            item.system?.sourceClass?.toLowerCase() === "wizard" ||
            item.system?.spellcastingClass?.toLowerCase() === "wizard" ||
            item.labels?.spellcastingClass?.toLowerCase() === "wizard" ||
            (Array.isArray(item.system?.classes) && item.system.classes.includes("wizard"));

          if (!isWizardSpell) continue;

          // Check duplicates
          const isDuplicate = existingSpells.some(
            (s) => s.uuid === item.uuid || (s.name.toLowerCase() === item.name.toLowerCase() && Number(s.level) === Number(item.system?.level ?? 0))
          );

          if (!isDuplicate) {
            existingSpells.push({
              id: item.id ?? foundry.utils.randomID(),
              uuid: item.uuid,
              name: item.name,
              img: item.img,
              level: item.system?.level ?? 0,
              components: item.labels?.components?.vsm ?? ""
            });
            addedCount++;
          }
        }
      }

      if (addedCount > 0) {
        await Data.setSpellbookSpells(this.spellbook, existingSpells);
        ui.notifications.info(`Successfully added ${addedCount} wizard spell(s) to ${this.spellbook.name}.`);
      } else {
        ui.notifications.info("No new wizard spells were found or added.");
      }

      if (this.onImportComplete) this.onImportComplete();
      this.close();
    });
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
      studySpellbook: NpcSpellbookSheet._onStudySpellbook
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
          const existing = Data.getSpellbookSpells(this.document);

          const isDuplicate = existing.some((s) => s.uuid === item.uuid || (s.name.toLowerCase() === item.name.toLowerCase() && Number(s.level) === Number(item.system?.level ?? 0)));
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
              level: item.system?.level ?? 0,
              components: item.labels?.components?.vsm ?? ""
            });
            await Data.setSpellbookSpells(this.document, existing);
          }
          this.render(false);
        } else {
          ui.notifications.warn("Only spells can be added to a spellbook.");
        }
      }
    };

    html.addEventListener("dragover", (e) => e.preventDefault());
    html.addEventListener("drop", this._dropHandler);
  }
}
