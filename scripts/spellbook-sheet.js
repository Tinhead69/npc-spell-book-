import * as Data from "./data.js";
import { StudySpellbookDialog } from "./learn-dialog.js";

const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

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

    const spells = Data.getSpellbookSpells ? Data.getSpellbookSpells(this.document) : [];
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
    const spellId = target.dataset.spellId;
    if (!Data.getSpellbookSpells || !Data.setSpellbookSpells) return;
    let spells = Data.getSpellbookSpells(this.document);
    spells = spells.filter((s) => s.id !== spellId && s.uuid !== spellId && s.name !== target.dataset.spellName);
    await Data.setSpellbookSpells(this.document, spells);
    this.render(false);
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

    // 1. Add Spell Button listener (Opens compendium sidebar tab safely)
    html.querySelectorAll(".add-spell, .add-spell-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        
        // Open Compendiums Tab in Sidebar
        if (typeof ui.sidebar?.changeTab === "function") {
          ui.sidebar.changeTab("compendium");
        } else if (typeof ui.sidebar?.activateTab === "function") {
          ui.sidebar.activateTab("compendium");
        }

        ui.notifications.info("Drag and drop spells from any compendium into this spellbook.");
      });
    });

    // 2. Drag & Drop Listener with Duplicate Prevention
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
          
          // Check for existing duplicate spell
          const isDuplicate = existing.some((s) => s.uuid === item.uuid || (s.name === item.name && Number(s.level) === Number(item.system?.level ?? 0)));
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
