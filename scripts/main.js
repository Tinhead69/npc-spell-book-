import { MODULE_ID } from "./data.js";
import { NpcSpellbookSheet } from "./spellbook-sheet.js";

// Register Sheet on Init
Hooks.once("init", () => {
  Items.registerSheet("dnd5e", NpcSpellbookSheet, {
    types: ["loot", "container", "consumable"],
    makeDefault: false,
    label: "NPC Spellbook Sheet"
  });
});

// Inject "Spellbook" into Item Creation Dialog
function injectSpellbookOption(app, html) {
  if (app.documentName !== "Item" && !app.options?.title?.includes("Item")) return;

  const root = html[0] || html;
  
  // Prevent duplicate insertion
  if (root.querySelector('input[value="spellbook"]')) return;

  const container = root.querySelector("ol, ul, .dialog-content, form");
  if (!container) return;

  const li = document.createElement("li");
  li.className = "form-group flexrow";
  li.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; margin: 2px 0; border-radius: 3px; cursor: pointer;";
  
  li.innerHTML = `
    <label class="radio-label flexrow" style="display: flex; align-items: center; width: 100%; cursor: pointer; gap: 8px;">
      <i class="fas fa-book" style="width: 20px; text-align: center; font-size: 1.1rem; color: #a33535;"></i>
      <span style="flex: 1; font-weight: 600; font-size: 0.95rem;">Spellbook</span>
      <input type="radio" name="type" value="spellbook" style="margin: 0; cursor: pointer;">
    </label>
  `;

  // Insert right after the "Spell" radio option
  const spellRadio = root.querySelector('input[value="spell"]');
  if (spellRadio) {
    const spellRow = spellRadio.closest("li, .form-group, div");
    if (spellRow && spellRow.parentNode) {
      spellRow.parentNode.insertBefore(li, spellRow.nextSibling);
    } else {
      container.appendChild(li);
    }
  } else {
    container.appendChild(li);
  }

  // Intercept form submission when "Spellbook" is selected
  const form = root.querySelector("form") || root.closest("form");
  if (form && !form.dataset.spellbookHooked) {
    form.dataset.spellbookHooked = "true";
    
    form.addEventListener("submit", async (event) => {
      const selectedType = form.querySelector('input[name="type"]:checked')?.value;
      if (selectedType === "spellbook") {
        event.preventDefault();
        event.stopPropagation();

        const nameInput = form.querySelector('input[name="name"]');
        const bookName = nameInput?.value?.trim() || "New Spellbook";
        const folderSelect = form.querySelector('select[name="folder"]');
        const folder = folderSelect?.value || null;

        const createdItem = await Item.create({
          name: bookName,
          type: "loot",
          img: "icons/svg/book.svg",
          folder: folder,
          flags: {
            [MODULE_ID]: {
              isSpellbook: true,
              spells: []
            }
          }
        });

        if (createdItem) {
          await createdItem.setFlag("core", "sheetClass", `dnd5e.${NpcSpellbookSheet.name}`);
          createdItem.sheet.render(true);
        }

        app.close();
      }
    }, { capture: true });
  }
}

Hooks.on("renderDocumentCreateDialog", injectSpellbookOption);
Hooks.on("renderDialog", injectSpellbookOption);
