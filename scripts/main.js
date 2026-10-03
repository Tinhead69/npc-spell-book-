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

function isTypeListSeparator(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.matches("hr, .separator, .divider, .form-fields-separator, .border")) return true;
  if (el.querySelector?.('input[name="type"]')) return false;
  // Thin decorative siblings used as dotted rules between type options
  const style = el.ownerDocument?.defaultView?.getComputedStyle?.(el);
  if (style && (style.borderBottomStyle === "dotted" || style.borderTopStyle === "dotted")) return true;
  if (el.tagName === "DIV" && !el.textContent.trim() && el.children.length === 0) return true;
  return false;
}

function findTypeListSeparator(root, nearEl) {
  const next = nearEl?.nextElementSibling;
  if (isTypeListSeparator(next)) return next;

  const prev = nearEl?.previousElementSibling;
  if (isTypeListSeparator(prev)) return prev;

  return root.querySelector("hr, .separator, .divider, .form-fields-separator");
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

    // Dialog structure is usually: [Spell] [separator] [Subclass]
    // Inserting only after Spell puts Spellbook before that separator, so Spell/Spellbook look joined.
    const existingSep = findTypeListSeparator(root, wrapper);
    const sepClone = existingSep ? existingSep.cloneNode(true) : (() => {
      const hr = document.createElement("hr");
      hr.className = "spellbook-type-separator";
      hr.style.cssText = "border: none; border-top: 1px dotted #666; margin: 2px 0;";
      return hr;
    })();

    const afterSpellSep = isTypeListSeparator(wrapper.nextElementSibling)
      ? wrapper.nextElementSibling
      : null;

    if (afterSpellSep) {
      // Spell | sep | Spellbook | sep | Subclass
      afterSpellSep.after(clone);
      clone.after(sepClone);
    } else {
      // Spell | sep | Spellbook | ...
      wrapper.after(sepClone);
      sepClone.after(clone);
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

        const createdItem = await Item.create({
          name: bookName,
          type: "loot",
          img: "icons/svg/book.svg",
          folder: folder,
          flags: {
            core: {
              sheetClass: SHEET_CLASS_ID
            },
            [MODULE_ID]: {
              isSpellbook: true,
              spells: []
            }
          }
        });

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
