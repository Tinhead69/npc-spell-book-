import { MODULE_ID } from "./data.js";
import { NpcSpellbookSheet } from "./spellbook-sheet.js";

// 1. Register the custom item sheet using DocumentSheetConfig (Foundry V12 / V13)
Hooks.once("init", () => {
  DocumentSheetConfig.registerSheet(Item, MODULE_ID, NpcSpellbookSheet, {
    types: ["loot", "container", "consumable"],
    makeDefault: false,
    label: "NPC Spellbook Sheet"
  });
});

// 2. Inject "Spellbook" option into the Create Item dialog
function addSpellbookToCreateDialog(app, html) {
  const root = html instanceof HTMLElement ? html : (html[0] || html);
  if (!root || !(root instanceof HTMLElement)) return;

  // Verify this is an Item creation dialog
  const isItemDialog = app?.documentName === "Item" || 
                        app?.options?.title?.toLowerCase().includes("item") || 
                        root.querySelector('input[name="type"]');
  if (!isItemDialog) return;

  // Prevent duplicate injection
  if (root.querySelector('input[value="spellbook"]')) return;

  // Find all radio options in the dialog
  const radios = root.querySelectorAll('input[name="type"]');
  if (!radios.length) return;

  // Find "spell" or "loot" row to clone its exact layout and styling
  let targetRadio = Array.from(radios).find(r => r.value.toLowerCase() === "spell") ||
                    Array.from(radios).find(r => r.value.toLowerCase() === "loot") ||
                    radios[radios.length - 1];

  const targetRow = targetRadio.closest("li, label, .form-group, div");
  if (!targetRow || !targetRow.parentNode) return;

  // Clone row so CSS layout and radio styling match perfectly
  const spellbookRow = targetRow.cloneNode(true);

  // Update radio value
  const radio = spellbookRow.querySelector('input[name="type"]');
  if (radio) {
    radio.value = "spellbook";
    radio.checked = false;
  }

  // Update text label to "Spellbook"
  const labelSpan = Array.from(spellbookRow.querySelectorAll("*")).find(
    el => el.children.length === 0 && el.textContent.trim().length > 0
  );
  if (labelSpan) labelSpan.textContent = "Spellbook";

  // Update icon to book
  const icon = spellbookRow.querySelector("i, img, svg");
  if (icon) {
    if (icon.tagName.toLowerCase() === "i") {
      icon.className = "fas fa-book";
      icon.style.color = "#a33535";
    } else if (icon.tagName.toLowerCase() === "img") {
      icon.src = "icons/svg/book.svg";
    }
  }

  // Insert directly below the target row
  targetRow.parentNode.insertBefore(spellbookRow, targetRow.nextSibling);

  // Intercept submit event when "Spellbook" is chosen
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

        // Create item with spellbook flags and sheetClass pre-configured
        const createdItem = await Item.create({
          name: bookName,
          type: "loot",
          img: "icons/svg/book.svg",
          folder: folder,
          flags: {
            [MODULE_ID]: {
              isSpellbook: true,
              spells: []
            },
            core: {
              sheetClass: `${MODULE_ID}.${NpcSpellbookSheet.name}`
            }
          }
        });

        if (createdItem) {
          createdItem.sheet?.render(true);
        }

        app.close();
      }
    }, { capture: true });
  }
}

// Hook into dialog renders
Hooks.on("renderDocumentCreateDialog", addSpellbookToCreateDialog);
Hooks.on("renderCreateDocumentDialog", addSpellbookToCreateDialog);
Hooks.on("renderDialog", addSpellbookToCreateDialog);
