import { MODULE_ID, getSpellbookSpells, removeSpellFromSpellbook } from "./data.js";
import { openTranscribeDialog } from "./mechanics.js";

const { HandlebarsApplicationMixin, ItemSheetV2 } = foundry.applications.api;

export class SpellbookSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    id: "spellbook-sheet",
    classes: ["dnd5e", "sheet", "item", "spellbook-sheet"],
    position: { width: 480, height: 560 },
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    }
  };

  static PARTS = {
    sheet: {
      template: `modules/${MODULE_ID}/templates/spellbook-sheet.hbs`
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    context.item = item;

    // Fetch spells currently stored in item flags
    const spells = getSpellbookSpells(item);

    // Group spells by level (0 to 9)
    const groups = {};
    for (const spell of spells) {
      const lvl = Number(spell.level ?? spell.system?.level ?? 0);
      const label = lvl === 0 ? "CANTRIPS" : `LEVEL ${lvl}`;
      if (!groups[lvl]) {
        groups[lvl] = { level: lvl, label, spells: [] };
      }
      groups[lvl].spells.push(spell);
    }

    // Sort groups in ascending level order
    context.spellGroups = Object.keys(groups)
      .map(Number)
      .sort((a, b) => a - b)
      .map((lvl) => groups[lvl]);

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    // Add Spells button handler
    html.querySelector(".btn-add-spells")?.addEventListener("click", (e) => {
      e.preventDefault();
      this._openAddSpellsDialog();
    });

    // Transcribe Spells button handler
    html.querySelector(".btn-transcribe-spells")?.addEventListener("click", (e) => {
      e.preventDefault();
      openTranscribeDialog(this.document);
    });

    // Clear Spellbook button handler
    html.querySelector(".btn-clear-spellbook")?.addEventListener("click", async (e) => {
      e.preventDefault();
      const confirm = await Dialog.confirm({
        title: "Clear Spellbook",
        content: "<p>Are you sure you want to remove all spells from this spellbook?</p>"
      });
      if (confirm) {
        await this.document.unsetFlag(MODULE_ID, "spells");
        this.render(true);
      }
    });

    // Individual spell delete handlers
    html.querySelectorAll(".delete-spell").forEach((el) => {
      el.addEventListener("click", async (e) => {
        e.preventDefault();
        const uuid = el.dataset.uuid;
        if (uuid) {
          await removeSpellFromSpellbook(this.document, uuid);
          this.render(true);
        }
      });
    });
  }

  /**
   * Dialog to browse and add spells from world item compendiums
   */
  async _openAddSpellsDialog() {
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

    new Dialog({
      title: "Add Spell to Spellbook",
      content: content,
      buttons: {
        add: {
          icon: '<i class="fas fa-plus"></i>',
          label: "Add",
          callback: async (html) => {
            const root = html instanceof HTMLElement ? html : html[0];
            const uuid = root.querySelector("#spell-select")?.value;
            if (uuid) {
              const spellDoc = await fromUuid(uuid);
              if (spellDoc) {
                const spells = getSpellbookSpells(this.document);
                spells.push({
                  uuid: spellDoc.uuid,
                  name: spellDoc.name,
                  level: spellDoc.system?.level ?? 0,
                  img: spellDoc.img
                });
                await this.document.setFlag(MODULE_ID, "spells", spells);
                this.render(true);
              }
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "add"
    }).render(true);
  }
}
