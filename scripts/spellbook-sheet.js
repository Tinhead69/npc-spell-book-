import * as Data from "./data.js";
import { StudySpellbookDialog } from "./learn-dialog.js";
import { CompendiumSpellPicker } from "./spellbook-compendium.js"; //[cite: 16]

const { ItemSheetV2 } = foundry.applications.sheets; //[cite: 16]
const { HandlebarsApplicationMixin } = foundry.applications.api; //[cite: 16]

export class NpcSpellbookSheet extends HandlebarsApplicationMixin(ItemSheetV2) { //[cite: 16]
  static DEFAULT_OPTIONS = {
    classes: ["npc-spellbook", "sheet", "item"], //[cite: 16]
    position: {
      width: 600, //[cite: 16]
      height: 650 //[cite: 16]
    },
    form: {
      handler: NpcSpellbookSheet._onSubmitForm, //[cite: 16]
      submitOnChange: true, //[cite: 16]
      closeOnSubmit: false //[cite: 16]
    },
    actions: {
      deleteSpell: NpcSpellbookSheet._onDeleteSpell, //[cite: 16]
      studySpellbook: NpcSpellbookSheet._onStudySpellbook //[cite: 16]
    }
  };

  static PARTS = {
    body: {
      template: "modules/npc-spell-book/templates/spellbook-sheet.hbs" //[cite: 16]
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options); //[cite: 16]
    context.item = this.document; //[cite: 16]
    context.isGM = game.user.isGM; //[cite: 16]

    const spells = Data.getSpellbookSpells ? Data.getSpellbookSpells(this.document) : []; //[cite: 16]
    const levels = {}; //[cite: 16]
    for (const spell of spells) { //[cite: 16]
      const lvl = Number(spell.level ?? 0); //[cite: 16]
      if (!levels[lvl]) levels[lvl] = []; //[cite: 16]
      levels[lvl].push(spell); //[cite: 16]
    }
    context.spellLevels = levels; //[cite: 16]

    return context; //[cite: 16]
  }

  static async _onSubmitForm(event, form, formData) {
    await this.document.update(formData.object); //[cite: 16]
  }

  static async _onDeleteSpell(event, target) {
    const spellId = target.dataset.spellId; //[cite: 16]
    if (!Data.getSpellbookSpells || !Data.setSpellbookSpells) return; //[cite: 16]
    let spells = Data.getSpellbookSpells(this.document); //[cite: 16]
    spells = spells.filter((s) => s.id !== spellId && s.uuid !== spellId); //[cite: 16]
    await Data.setSpellbookSpells(this.document, spells); //[cite: 16]
    this.render(false); //[cite: 16]
  }

  static async _onStudySpellbook(event, target) {
    try {
      new StudySpellbookDialog({ spellbook: this.document }).render(true); //[cite: 16]
    } catch (err) {
      console.error("NPC Spellbook | Failed to open Study Dialog:", err); //[cite: 16]
    }
  }

  _onRender(context, options) {
    super._onRender(context, options); //[cite: 16]

    const html = this.element; //[cite: 16]

    // Open Compendium Search Picker on "Add Spell" button click
    html.querySelectorAll(".add-spell, .add-spell-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        new CompendiumSpellPicker({ spellbook: this.document }).render(true);
      });
    });

    // Drag & Drop Listener
    html.addEventListener("dragover", (e) => e.preventDefault()); //[cite: 16]
    html.addEventListener("drop", async (e) => {
      e.preventDefault(); //[cite: 16]
      let data;
      try {
        data = JSON.parse(e.dataTransfer.getData("text/plain")); //[cite: 16]
      } catch (err) {
        return; //[cite: 16]
      }

      if (data?.type === "Item") { //[cite: 16]
        const item = await Item.implementation.fromDropData(data); //[cite: 16]
        if (item && item.type === "spell") { //[cite: 16]
          if (typeof Data.addSpellToSpellbook === "function") { //[cite: 16]
            await Data.addSpellToSpellbook(this.document, item); //[cite: 16]
          } else if (typeof Data.getSpellbookSpells === "function" && typeof Data.setSpellbookSpells === "function") { //[cite: 16]
            const spells = Data.getSpellbookSpells(this.document); //[cite: 16]
            spells.push({
              id: item.id, //[cite: 16]
              uuid: item.uuid, //[cite: 16]
              name: item.name, //[cite: 16]
              img: item.img, //[cite: 16]
              level: item.system?.level ?? 0, //[cite: 16]
              components: item.labels?.components?.vsm ?? "" //[cite: 16]
            });
            await Data.setSpellbookSpells(this.document, spells); //[cite: 16]
          }
          this.render(false); //[cite: 16]
        } else {
          ui.notifications.warn("Only spells can be added to a spellbook."); //[cite: 16]
        }
      }
    });
  }
}
