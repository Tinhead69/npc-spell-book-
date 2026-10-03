import { MODULE_ID } from "./data.js";
import { getSpellbookSheetClass } from "./spellbook-sheet.js";

const SHEET_CLASS_ID = `${MODULE_ID}.SpellbookSheet`;

function getDocumentSheetConfig() {
  return foundry.applications.apps?.DocumentSheetConfig
    || foundry.applications.api?.DocumentSheetConfig
    || globalThis.DocumentSheetConfig;
}

function getItemDocumentClass() {
  return CONFIG.Item?.documentClass || globalThis.Item;
}

/**
 * Spellbook items must use SpellbookSheet even when the default loot sheet is selected.
 */
function patchItemSheetClass() {
  const ItemClass = getItemDocumentClass();
  const proto = ItemClass?.prototype;
  if (!proto || proto._npcSpellbookSheetPatched) return;

  const original = proto._getSheetClass;
  proto._getSheetClass = function _npcSpellbookGetSheetClass() {
    if (this.getFlag(MODULE_ID, "isSpellbook")) {
      return getSpellbookSheetClass();
    }
    return original.call(this);
  };
  proto._npcSpellbookSheetPatched = true;
}

Hooks.once("init", () => {
  try {
    const SpellbookSheet = getSpellbookSheetClass();
    const DocumentSheetConfig = getDocumentSheetConfig();
    const ItemClass = getItemDocumentClass();

    if (!SpellbookSheet) {
      console.error("NPC Spellbook | SpellbookSheet class could not be created.");
      return;
    }

    if (!DocumentSheetConfig?.registerSheet) {
      console.error("NPC Spellbook | DocumentSheetConfig.registerSheet is unavailable.");
      return;
    }

    DocumentSheetConfig.registerSheet(ItemClass, MODULE_ID, SpellbookSheet, {
      types: ["loot", "container", "consumable"],
      makeDefault: false,
      label: "NPC Spellbook Sheet"
    });

    patchItemSheetClass();
    console.log("NPC Spellbook | Initialized");
  } catch (err) {
    console.error("NPC Spellbook | Failed to initialize", err);
  }
});

function isCreateTypeOption(el) {
  return Boolean(el?.querySelector?.('input[name="type"]'));
}

/**
 * Separator siblings between type options (not <hr> near Folder).
 * Foundry often uses empty decorative nodes for the dotted rules.
 */
function isCreateTypeSeparator(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (isCreateTypeOption(el)) return false;
  if (el.tagName === "HR") return false;
  if (el.matches(".separator, .divider, .form-fields-separator, [data-spellbook-type-sep]")) return true;
  const empty = !el.textContent.trim()
    && !el.querySelector("input, select, textarea, button, img, svg, i, label");
  if (!empty) return false;
  return isCreateTypeOption(el.previousElementSibling)
    || isCreateTypeOption(el.nextElementSibling);
}

/** Find a native separator that sits between two type options in the same list. */
function findNativeTypeSeparator(parent) {
  if (!parent) return null;
  const kids = Array.from(parent.children);
  for (let i = 1; i < kids.length - 1; i++) {
    if (!isCreateTypeSeparator(kids[i])) continue;
    if (isCreateTypeOption(kids[i - 1]) && isCreateTypeOption(kids[i + 1])) return kids[i];
  }
  return null;
}

function addSpellbookToCreateDialog(app, html) {
  const root = html instanceof HTMLElement ? html : (html[0] || html);
  if (!root || !(root instanceof HTMLElement)) return;

  if (root.querySelector('input[value="spellbook"]')) return;

  const radios = Array.from(root.querySelectorAll('input[name="type"]'));
  if (!radios.length) return;

  const targetRadio = radios.find(r => r.value === "spell") ||
                      radios.find(r => r.value === "loot") ||
                      radios[radios.length - 1];

  if (!targetRadio) return;

  const wrapper = targetRadio.closest("li, .form-group, label.checkbox, label.radio, div.type-option, label") || targetRadio.parentElement;

  if (wrapper) {
    const clone = wrapper.cloneNode(true);

    const radio = clone.querySelector('input[name="type"]');
    if (radio) {
      radio.value = "spellbook";
      radio.checked = false;
      radio.id = `type-spellbook-${Math.random().toString(36).substring(2, 7)}`;
    }

    const textTargets = Array.from(clone.querySelectorAll("span, label, p, strong, b")).concat([clone]);
    for (const el of textTargets) {
      if (el.children.length === 0 && el.textContent.trim().length > 0) {
        el.textContent = "Spellbook";
        break;
      }
    }

    const icon = clone.querySelector("i, img, svg");
    if (icon) {
      if (icon.tagName.toLowerCase() === "i") {
        icon.className = "fas fa-book";
        icon.style.color = "#a33535";
      } else if (icon.tagName.toLowerCase() === "img") {
        icon.src = "icons/svg/book.svg";
      }
    }

    // List is usually: [Spell] [sep] [Subclass]
    // Want:           [Spell] [sep] [Spellbook] [sep] [Subclass]
    // Clone the native sep node so style matches other rows (no invented dotted rules).
    const afterSpellSep = isCreateTypeSeparator(wrapper.nextElementSibling)
      ? wrapper.nextElementSibling
      : null;
    const sepSource = afterSpellSep || findNativeTypeSeparator(wrapper.parentElement);

    if (afterSpellSep) {
      afterSpellSep.after(clone);
      clone.after(afterSpellSep.cloneNode(true));
    } else if (sepSource) {
      wrapper.after(sepSource.cloneNode(true));
      wrapper.nextElementSibling.after(clone);
      if (isCreateTypeOption(clone.nextElementSibling)) {
        clone.after(sepSource.cloneNode(true));
      }
    } else {
      wrapper.after(clone);
    }
  }

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

        const itemData = {
          name: bookName,
          type: "loot",
          img: "icons/svg/book.svg",
          folder: folder,
          system: {
            // Keep as a plain array so modules that call .includes() on properties
            // (e.g. Shared Container) do not crash on dnd5e's Set-based model.
            properties: []
          },
          flags: {
            core: {
              sheetClass: SHEET_CLASS_ID
            },
            [MODULE_ID]: {
              isSpellbook: true,
              spells: []
            }
          }
        };

        // Skip preCreate hooks: Shared Container calls properties.includes() and throws
        // when dnd5e has already coerced properties into a Set.
        const createdItem = await Item.create(itemData, { noHook: true });

        if (createdItem) {
          const SpellbookSheet = getSpellbookSheetClass();
          new SpellbookSheet({ document: createdItem }).render({ force: true });
        }

        if (typeof app.close === "function") app.close();
      }
    }, { capture: true });
  }
}

Hooks.on("renderDocumentCreateDialog", addSpellbookToCreateDialog);
Hooks.on("renderCreateDocumentDialog", addSpellbookToCreateDialog);
Hooks.on("renderDialog", addSpellbookToCreateDialog);
Hooks.on("renderApplication", addSpellbookToCreateDialog);
