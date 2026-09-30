import * as Data from "./data.js";
import { StudySpellbookDialog } from "./learn-dialog.js";

const { ItemSheetV2 } = foundry.applications.sheets;
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog to display installed compendiums containing Wizard spells
 */
class CompendiumPickerDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "compendium-picker-dialog",
    classes: ["compendium-picker"],
    position: { width: 400, height: 450 },
    tag: "div"
  };

  static PARTS = {
    main: {
      template: "modules/npc-spell-book/templates/compendium-picker.hbs"
    }
  };

  get title() {
    return "Select Wizard Spell Compendium";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    // Find all Item compendiums
    const itemPacks = game.packs.filter((p) => p.metadata.type === "Item");
    const validPacks = [];

    for (const pack of itemPacks) {
      // Load index if not cached
      const index = await pack.getIndex({ fields: ["type", "system.sourceClass"] });
      const hasSpells = index.some((i) => i.type === "spell");

      if (hasSpells) {
        validPacks.push({
          collection: pack.collection,
          title: pack.metadata.label,
          package: pack.metadata.packageName
        });
      }
    }

    context.packs = validPacks;
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    
    // Attach click listeners to open selected compendium with wizard filter applied
    this.element.querySelectorAll(".pack-link").forEach((link) => {
      link.addEventListener("click", async (e) => {
        e.preventDefault();
        const packId = e.currentTarget.dataset.packId;
        const pack = game.packs.get(packId);

        if (pack) {
          const compendiumWindow = await pack.render(true);
          
          // Apply Wizard class filter if supported by dnd5e compendium view
          if (compendiumWindow?.element) {
            const searchInput = compendiumWindow.element.querySelector("input[type='search'], .filter-search");
            if (searchInput) {
              searchInput.value = "wizard";
              searchInput.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
          this.close();
        }
      });
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

    // --- Automatic Duplicate Deduplication ---
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

    // Group clean spells by level
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

    // 1. Add Spell Button listener (Opens custom compendium picker dialog)
    html.querySelectorAll(".add-spell, .add-spell-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        new CompendiumPickerDialog().render(true);
      });
    });

    // 2. Delete Spell Button listeners
    html.querySelectorAll(".delete-spell, .spell-delete, [data-action='deleteSpell'], .fa-trash, .fa-trash-can").forEach((btn) => {
      btn.addEventListener("click", (e) => NpcSpellbookSheet._onDeleteSpell.call(this, e, e.currentTarget));
    });

    // 3. Drag & Drop Listener with Duplicate Prevention
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
