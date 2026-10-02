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

// Inject "Spellbook" into the "Create Item" Dialog
Hooks.on("renderDocumentCreateDialog", (app, html, data) => {
  if (app.documentName !== "Item") return;

  const htmlElement = html[0] || html;
  const listContainer = htmlElement.querySelector("ol, ul, .form-group");

  if (!listContainer) return;

  // Create the Spellbook option element matching dnd5e radio styling
  const spellbookOption = document.createElement("li");
  spellbookOption.className = "form-group";
  spellbookOption.innerHTML = `
    <label class="radio-label flexrow" style="align-items: center; cursor: pointer; padding: 4px 0;">
      <i class="fas fa-book" style="width: 24px; text-align: center; font-size: 1.1rem; margin-right: 8px; color: #aaa;"></i>
      <span style="flex: 1; font-weight: 500;">Spellbook</span>
      <input type="radio" name="type" value="spellbook" style="margin-left: auto;">
    </label>
  `;

  listContainer.appendChild(spellbookOption);

  // Intercept form submission when "Spellbook" is selected
  const form = htmlElement.querySelector("form");
  if (form) {
    form.addEventListener("submit", async (event) => {
      const selectedType = form.querySelector('input[name="type"]:checked')?.value;
      if (selectedType === "spellbook") {
        event.preventDefault();
        event.stopPropagation();

        const nameInput = form.querySelector('input[name="name"]');
        const bookName = nameInput?.value?.trim() || "New Spellbook";
        const folder = form.querySelector('select[name="folder"]')?.value || null;

        // Create the underlying item as 'loot' with the spellbook flag and given name
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
          // Assign sheet class and open
          await createdItem.setFlag("core", "sheetClass", `dnd5e.${NpcSpellbookSheet.name}`);
          createdItem.sheet.render(true);
        }

        app.close();
      }
    }, { capture: true });
  }
});
