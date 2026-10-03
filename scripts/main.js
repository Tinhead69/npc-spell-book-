import {
  MODULE_ID,
  SPELLBOOK_ICON,
  getEntryId,
  isSpellbook,
  markAsSpellbook
} from "./data.js";
import { NpcSpellbookSheet } from "./spellbook-sheet.js";

// Register Item Sheet via V13 namespace
Hooks.once("init", async () => {
  console.log("NPC Spellbook | Initialising V13 Module");

  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, MODULE_ID, NpcSpellbookSheet, {
    types: ["loot"],
    label: "NPC Spellbook Sheet",
    makeDefault: false
  });

  patchItemDirectoryContextMenu();
});

Hooks.once("setup", () => {
  ui.notifications?.info("NPC Spellbook | Sheet registered successfully!");
});

// Intercept item sheet requests for spellbooks
Hooks.on("getItemSheetClass", (item) => {
  if (isSpellbook(item)) {
    return NpcSpellbookSheet;
  }
});

/**
 * Inject "Spellbook" option into Create Item dialogs
 */
function addSpellbookToCreateDialog(app, html) {
  const root = html instanceof HTMLElement ? html : (html[0] || html);
  if (!root || !(root instanceof HTMLElement)) return;

  if (root.querySelector('[value="spellbook"]')) return;

  // Case A: Select Dropdown (<select name="type">)
  const selectElem = root.querySelector('select[name="type"]');
  if (selectElem) {
    const option = document.createElement("option");
    option.value = "spellbook";
    option.textContent = "Spellbook";

    const targetOpt = selectElem.querySelector('option[value="spell"]') ||
                      selectElem.querySelector('option[value="loot"]');
    if (targetOpt) {
      targetOpt.after(option);
    } else {
      selectElem.appendChild(option);
    }
  } 
  // Case B: Radio input / grid layout (<input name="type">)
  else {
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
          icon.src = SPELLBOOK_ICON || "icons/svg/book.svg";
        }
      }

      wrapper.after(clone);
    }
  }

  // Intercept form submission when "Spellbook" is chosen
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
          img: SPELLBOOK_ICON || "icons/svg/book.svg",
          folder: folder,
          flags: {
            [MODULE_ID]: {
              isSpellbook: true,
              spells: []
            }
          }
        });

        if (createdItem) {
          new NpcSpellbookSheet({ document: createdItem }).render(true);
        }

        if (typeof app.close === "function") {
          app.close();
        } else if (typeof app.destroy === "function") {
          app.destroy();
        }
      }
    }, { capture: true });
  }
}

Hooks.on("renderDocumentCreateDialog", addSpellbookToCreateDialog);
Hooks.on("renderCreateDocumentDialog", addSpellbookToCreateDialog);
Hooks.on("renderDialog", addSpellbookToCreateDialog);
Hooks.on("renderApplication", addSpellbookToCreateDialog);

/**
 * Item directory context options using V13 ItemDirectory namespace
 */
function patchItemDirectoryContextMenu() {
  const ItemDirectoryClass = foundry.applications.sidebar.tabs.ItemDirectory;

  if (!ItemDirectoryClass?.prototype?._getEntryContextOptions) return;

  const original = ItemDirectoryClass.prototype._getEntryContextOptions;

  ItemDirectoryClass.prototype._getEntryContextOptions = function () {
    const options = original.call(this) ?? [];

    options.push({
      name: "Mark as Spellbook",
      icon: '<i class="fas fa-book"></i>',
      condition: (li) => {
        const id = getEntryId(li);
        const item = game.items.get(id);
        return item?.type === "loot" && !isSpellbook(item);
      },
      callback: async (li) => {
        const id = getEntryId(li);
        const item = game.items.get(id);
        if (!item) return;
        await markAsSpellbook(item);
        ui.notifications?.info(`Marked ${item.name} as a spellbook.`);
        new NpcSpellbookSheet({ document: item }).render(true);
      }
    });

    options.push({
      name: "Unmark as Spellbook",
      icon: '<i class="fas fa-book-dead"></i>',
      condition: (li) => {
        const id = getEntryId(li);
        return isSpellbook(game.items.get(id));
      },
      callback: async (li) => {
        const id = getEntryId(li);
        const item = game.items.get(id);
        if (!item) return;
        await item.unsetFlag(MODULE_ID, "isSpellbook");
        await item.unsetFlag(MODULE_ID, "spells");
        ui.notifications?.info(`Unmarked ${item.name} as a spellbook.`);
      }
    });

    options.push({
      name: "Open Spellbook",
      icon: '<i class="fas fa-book-open"></i>',
      condition: (li) => {
        const id = getEntryId(li);
        return isSpellbook(game.items.get(id));
      },
      callback: (li) => {
        const id = getEntryId(li);
        const item = game.items.get(id);
        if (item) new NpcSpellbookSheet({ document: item }).render(true);
      }
    });

    return options;
  };
}
