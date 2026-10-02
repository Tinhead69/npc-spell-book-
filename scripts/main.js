import { MODULE_ID } from "./data.js";
import { getSpellbookSheetClass } from "./spellbook-sheet.js";

// 1. Register sheet dynamically once Foundry initialization reaches "init"
Hooks.once("init", () => {
  const SpellbookSheet = getSpellbookSheetClass();
  const DocumentSheetConfig = foundry.applications.config.DocumentSheetConfig || globalThis.DocumentSheetConfig;

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

  if (root.querySelector('input[value="spellbook"]')) return;

  const radios = Array.from(root.querySelectorAll('input[name="type"]'));
  if (!radios.length) return;

  // Find target radio option
  const targetRadio = radios.find(r => r.value === "spell") ||
                      radios.find(r => r.value === "loot") ||
                      radios[radios.length - 1];

  if (!targetRadio) return;

  // Isolate target row item
  const wrapper = targetRadio.closest("li, .form-group, label.checkbox, label.radio, div.type-option, label") || targetRadio.parentElement;

  if (wrapper) {
    const clone = wrapper.cloneNode(true);

    // Update cloned input
    const radio = clone.querySelector('input[name="type"]');
    if (radio) {
      radio.value = "spellbook";
      radio.checked = false;
      radio.id = `type-spellbook-${Math.random().toString(36).substring(2, 7)}`;
    }

    // Update label text
    const textTargets = Array.from(clone.querySelectorAll("span, label, p, strong, b")).concat([clone]);
    for (const el of textTargets) {
      if (el.children.length === 0 && el.textContent.trim().length > 0) {
        el.textContent = "Spellbook";
        break;
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

    wrapper.after(clone);
  }

  // Intercept form submit when "Spellbook" is chosen
  const form = root.tagName === "FORM" ? root : root.querySelector("form") || root.closest("form");
  if (form && !form.dataset.spellbookHooked) {
    form.dataset.spellbookHooked = "true";

    form.addEventListener("submit", async (event) => {
      const formData = new FormData(form);
      const selectedType = formData.get("type");

      if (selectedType === "spellbook") {
        event.preventDefault();
        event.stopPropagation();

        const nameInput = form.querySelector('input[name="name"]');
        const bookName = nameInput?.value?.trim() || "New Spellbook";
        const folderSelect = form.querySelector('select[name="folder"]');
        const folder = folderSelect?.value || null;

        const SpellbookSheet = getSpellbookSheetClass();

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

// Hooks for V13 dialog rendering
Hooks.on("renderDocumentCreateDialog", addSpellbookToCreateDialog);
Hooks.on("renderCreateDocumentDialog", addSpellbookToCreateDialog);
Hooks.on("renderDialog", addSpellbookToCreateDialog);
Hooks.on("renderApplication", addSpellbookToCreateDialog);
