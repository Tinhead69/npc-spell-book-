import { MODULE_ID } from "./data.js";
import { SpellbookSheet, NpcSpellbookSheet } from "./spellbook-sheet.js";

const DocumentSheetConfig = foundry.applications.config.DocumentSheetConfig || globalThis.DocumentSheetConfig;

// 1. Register custom item sheet in V13
Hooks.once("init", () => {
  DocumentSheetConfig.registerSheet(Item, MODULE_ID, SpellbookSheet, {
    types: ["loot", "container", "consumable"],
    makeDefault: false,
    label: "NPC Spellbook Sheet"
  });
});

// 2. Inject "Spellbook" option into Create Item dialogs
function addSpellbookToCreateDialog(app, html) {
  const root = html instanceof HTMLElement ? html : (html[0] || html);
  if (!root || !(root instanceof HTMLElement)) return;

  const typeInput = root.querySelector('[name="type"]');
  if (!typeInput) return;

  if (root.querySelector('[value="spellbook"]')) return;

  // Handle <select name="type"> dropdowns
  if (typeInput.tagName === "SELECT") {
    const option = document.createElement("option");
    option.value = "spellbook";
    option.textContent = "Spellbook";
    typeInput.appendChild(option);
  } 
  // Handle radio / card grid inputs
  else {
    const radios = root.querySelectorAll('input[name="type"]');
    if (!radios.length) return;

    let targetRadio = Array.from(radios).find(r => r.value.toLowerCase() === "spell") ||
                      Array.from(radios).find(r => r.value.toLowerCase() === "loot") ||
                      radios[radios.length - 1];

    const targetRow = targetRadio.closest("li, label, .form-group, .type-option, div");
    if (targetRow && targetRow.parentNode) {
      const spellbookRow = targetRow.cloneNode(true);

      const radio = spellbookRow.querySelector('input[name="type"]');
      if (radio) {
        radio.value = "spellbook";
        radio.checked = false;
        if (radio.id) radio.id = `type-spellbook-${Math.random().toString(36).substring(2, 7)}`;
      }

      const labelSpan = Array.from(spellbookRow.querySelectorAll("*")).find(
        el => el.children.length === 0 && el.textContent.trim().length > 0
      );
      if (labelSpan) labelSpan.textContent = "Spellbook";

      const icon = spellbookRow.querySelector("i, img, svg");
      if (icon) {
        if (icon.tagName.toLowerCase() === "i") {
          icon.className = "fas fa-book";
          icon.style.color = "#a33535";
        } else if (icon.tagName.toLowerCase() === "img") {
          icon.src = "icons/svg/book.svg";
        }
      }

      targetRow.parentNode.insertBefore(spellbookRow, targetRow.nextSibling);
    }
  }

  // Intercept submit when "Spellbook" is chosen
  const form = root.tagName === "FORM" ? root : root.querySelector("form") || root.closest("form");
  if (form && !form.dataset.spellbookHooked) {
    form.dataset.spellbookHooked = "true";

    form.addEventListener("submit", async (event) => {
      const selectedType = new FormData(form).get("type") || form.querySelector('[name="type"]:checked, select[name="type"]')?.value;

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
            },
            core: {
              sheetClass: `${MODULE_ID}.${SpellbookSheet.name}`
            }
          }
        });

        if (createdItem) {
          createdItem.sheet?.render(true);
        }

        if (typeof app.close === "function") app.close();
      }
    }, { capture: true });
  }
}

// Hook into dialog renders
Hooks.on("renderDocumentCreateDialog", addSpellbookToCreateDialog);
Hooks.on("renderCreateDocumentDialog", addSpellbookToCreateDialog);
Hooks.on("renderDialog", addSpellbookToCreateDialog);
Hooks.on("renderApplication", addSpellbookToCreateDialog);
