import { MODULE_ID } from "./data.js";
import { SpellbookSheet } from "./spellbook-sheet.js";

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

  const radios = Array.from(root.querySelectorAll('input[name="type"]'));
  const select = root.querySelector('select[name="type"]');

  if (!radios.length && !select) return;
  if (root.querySelector('[value="spellbook"]')) return; // Prevent duplicates

  // Option A: Handle <select name="type"> dropdowns
  if (select) {
    const option = document.createElement("option");
    option.value = "spellbook";
    option.textContent = "Spellbook";
    select.appendChild(option);
  } 
  // Option B: Handle radio / card grid list
  else if (radios.length) {
    // Find a target radio row to clone (e.g. "spell" or "loot")
    const targetRadio = radios.find(r => r.value === "spell") ||
                        radios.find(r => r.value === "loot") ||
                        radios[radios.length - 1];

    // Isolate the immediate row container wrapping ONLY this radio
    let row = targetRadio.parentElement;
    while (row && row !== root && row.querySelectorAll('input[name="type"]').length === 1) {
      if (["LI", "LABEL", "DIV", "TR"].includes(row.tagName)) break;
      row = row.parentElement;
    }

    if (row && row.parentNode) {
      const clone = row.cloneNode(true);

      // Update cloned radio value
      const radio = clone.querySelector('input[name="type"]');
      if (radio) {
        radio.value = "spellbook";
        radio.checked = false;
        radio.id = `type-spellbook-${Math.random().toString(36).substring(2, 7)}`;
      }

      // Update text label
      const textElements = Array.from(clone.querySelectorAll("span, label, p, div, strong, b"));
      let updatedLabel = false;
      for (const el of textElements) {
        if (el.children.length === 0 && el.textContent.trim().length > 0) {
          el.textContent = "Spellbook";
          updatedLabel = true;
          break;
        }
      }
      if (!updatedLabel) {
        for (const child of clone.childNodes) {
          if (child.nodeType === Node.TEXT_NODE && child.textContent.trim().length > 0) {
            child.textContent = "Spellbook";
            break;
          }
        }
      }

      // Update icon to book
      const icon = clone.querySelector("i, img, svg");
      if (icon) {
        if (icon.tagName.toLowerCase() === "i") {
          icon.className = "fas fa-book";
          icon.style.color = "#a33535";
        } else if (icon.tagName.toLowerCase() === "img") {
          icon.src = "icons/svg/book.svg";
        }
      }

      // Insert directly after target row
      row.parentNode.insertBefore(clone, row.nextSibling);
    }
  }

  // Intercept submit when "Spellbook" is chosen
  const form = root.tagName === "FORM" ? root : root.querySelector("form") || root.closest("form");
  if (form && !form.dataset.spellbookHooked) {
    form.dataset.spellbookHooked = "true";

    form.addEventListener("submit", async (event) => {
      const formData = new FormData(form);
      const selectedType = formData.get("type") || form.querySelector('[name="type"]:checked, select[name="type"]')?.value;

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
