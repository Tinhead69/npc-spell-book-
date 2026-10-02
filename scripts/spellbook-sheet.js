import { MODULE_ID, getSpellbookSpells, removeSpellFromSpellbook } from "./data.js";
import { openTranscribeDialog } from "./mechanics.js";

let SpellbookSheetClass = null;

/**
 * Returns the SpellbookSheet class, constructing it inside the init lifecycle 
 * to ensure foundry.applications.api is fully populated.
 */
export function getSpellbookSheetClass() {
  if (SpellbookSheetClass) return SpellbookSheetClass;

  const { HandlebarsApplicationMixin, DocumentSheetV2, DialogV2 } = foundry.applications.api;

  SpellbookSheetClass = class SpellbookSheet extends HandlebarsApplicationMixin(DocumentSheetV2) {
    static DEFAULT_OPTIONS = {
      tag: "form",
      id: "spellbook-sheet",
      classes: ["dnd5e", "sheet", "item", "spellbook-sheet"],
      position: { width: 480, height: 560 },
      form: {
        handler: SpellbookSheet._onFormSubmit,
        submitOnChange: true,
        closeOnSubmit: false
      },
      actions: {
        addSpells: SpellbookSheet._onAddSpells,
        transcribeSpells: SpellbookSheet._onTranscribeSpells,
        clearSpellbook: SpellbookSheet._onClearSpellbook,
        deleteSpell: SpellbookSheet._onDeleteSpell
      }
    };

    static PARTS = {
      sheet: {
        template: `modules/${MODULE_ID}/templates/spellbook-sheet.hbs`
      }
    };

    get item() {
      return this.document;
    }

    /** @override */
    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      const item = this.document;
      context.item = item;

      const spells = getSpellbookSpells(item);

      const groups = {};
      for (const spell of spells) {
        const lvl = Number(spell.level ?? spell.system?.level ?? 0);
        const label = lvl === 0 ? "CANTRIPS" : `LEVEL ${lvl}`;
        if (!groups[lvl]) {
          groups[lvl] = { level: lvl, label, spells: [] };
        }
        groups[lvl].spells.push(spell);
      }

      context.spellGroups = Object.keys(groups)
        .map(Number)
        .sort((a, b) => a - b)
        .map((lvl) => groups[lvl]);

      return context;
    }

    /** Action: Open dialog to browse and add spells */
    static async _onAddSpells(event, target) {
      const packs = game.packs.filter((p) => p.metadata.type === "Item");
      let allSpells = [];

      for (const pack of packs) {
        const index = await pack.getIndex({ fields: ["system.level", "img", "type"] });
        const spells = index.filter((i) => i.type === "spell");
        allSpells.push(...spells);
      }

      if (!allSpells.length) {
        ui.notifications.warn("No spell compendiums found in world.");
        return;
      }

      allSpells.sort((a, b) => a.name.localeCompare(b.name));

      const optionsHtml = allSpells
        .map((s) => `<option value="${s.uuid}">${s.name} (Lvl ${s.system?.level ?? 0})</option>`)
        .join("");

      const content = `
        <div style="padding: 6px;">
          <label style="font-weight: bold; font-size: 0.85rem;">Select Spell to Add:</label>
          <select id="spell-select" style="width: 100%; margin-top: 6px; padding: 4px; background: #111; color: #fff; border: 1px solid #444;">
            ${optionsHtml}
          </select>
        </div>
      `;

      const selectedUuid = await DialogV2.prompt({
        window: { title: "Add Spell to Spellbook" },
        content: content,
        ok: {
          label: "Add",
          icon: "fas fa-plus",
          callback: (event, button) => button.form.querySelector("#spell-select")?.value
        },
        rejectClose: false
      });

      if (selectedUuid) {
        const spellDoc = await fromUuid(selectedUuid);
        if (spellDoc) {
          const spells = Array.from(getSpellbookSpells(this.document));
          if (!spells.some((s) => s.uuid === spellDoc.uuid)) {
            spells.push({
              uuid: spellDoc.uuid,
              name: spellDoc.name,
              level: spellDoc.system?.level ?? 0,
              img: spellDoc.img
            });
            await this.document.setFlag(MODULE_ID, "spells", spells);
            this.render(true);
          } else {
            ui.notifications.info(`"${spellDoc.name}" is already in this spellbook.`);
          }
        }
      }
    }

    /** Action: Open transcribe dialog */
    static _onTranscribeSpells(event, target) {
      openTranscribeDialog(this.document);
    }

    /** Action: Clear all spells */
    static async _onClearSpellbook(event, target) {
      const confirmed = await DialogV2.confirm({
        window: { title: "Clear Spellbook" },
        content: "<p>Are you sure you want to remove all spells from this spellbook?</p>",
        rejectClose: false
      });

      if (confirmed) {
        await this.document.unsetFlag(MODULE_ID, "spells");
        this.render(true);
      }
    }

    /** Action: Delete individual spell */
    static async _onDeleteSpell(event, target) {
      const uuid = target.dataset.uuid;
      if (uuid) {
        await removeSpellFromSpellbook(this.document, uuid);
        this.render(true);
      }
    }

    /** Form submission handler */
    static async _onFormSubmit(event, form, formData) {
      await this.document.update(formData.object);
    }
  };

  return SpellbookSheetClass;
}
