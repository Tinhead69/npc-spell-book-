# NPC Spellbook v0.1.4

## Included in this version
- Right-click item directory option: **Mark as Spellbook**
- Right-click item directory option: **Remove Spellbook Flag**
- **Spellbook** option injected into the **Create New Item** dialog

## Expected behaviour
When **Spellbook** is selected in the create item dialog, the module creates:
- a new **Loot** item
- named **New Spellbook**
- with spellbook flags applied

## Test steps
1. Enable the module.
2. Open the Items directory.
3. Click **Create Item**.
4. Confirm **Spellbook** appears in the type list.
5. Select **Spellbook** and create the item.
6. Confirm the new item is created and is already marked as a spellbook.
