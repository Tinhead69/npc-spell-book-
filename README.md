# NPC Spellbook

Minimal Foundry VTT module scaffold for a lootable NPC spellbook workflow.

## Included in this version
- Module manifest configured for GitHub install
- Right-click item directory option: **Mark as Spellbook**
- Right-click item directory option: **Remove Spellbook Flag**

## How to test
1. Install and enable the module.
2. Open the **Items Directory**.
3. Create a new **Loot** item.
4. Right-click the item.
5. Choose **Mark as Spellbook**.
6. The item will receive:
   - `flags["npc-spell-book"].isSpellbook = true`
   - `flags["npc-spell-book"].spells = []`

## GitHub repo
https://github.com/Tinhead69/npc-spell-book
