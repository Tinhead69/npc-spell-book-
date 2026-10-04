# NPC Spellbook (Foundry v13)

A Foundry VTT module for **D&D 5e (2014)** that adds lootable NPC wizard spellbooks. Wizards can transcribe spells using Player's Handbook rules, stored **independently** of the dnd5e system spellbook.

## Requirements

- Foundry VTT **v13.351+**
- [D&D 5e system](https://github.com/foundryvtt/dnd5e) **3.0+**

## Features

- Create **Spellbook** loot items (Create Item dialog or right-click → Mark as Spellbook)
- GM manages NPC spell lists via drag-and-drop or a filtered wizard-spell compendium browser (including a **Homebrew** group for world Items; GM marks which are wizard spells)
- Wizards **Study Spellbook** / **Transcribe** to copy spells into their own book
- Side-by-side compare of loot book contents vs the wizard's known spells
- **5e 2014 mechanics** enforced by wizard level:
  - Max spell level = `ceil(wizard level / 2)` (PHB spell slot progression)
  - Cost: **50 gp per spell level**
  - Time: **2 hours per spell level**
- **Currency:** affordability and deduction use the wizard's **full purse** (PP, GP, EP, SP, CP) converted with dnd5e rates — not GP alone. The UI shows total wealth as a GP equivalent.
- Transcribed spells are also logged in module flags (`Transcribed Spells` on the character sheet)
- Does **not** modify the built-in dnd5e spellbook or spell preparation
- When a spellbook is owned by a player, only a GM or Trusted Player can add/clear/delete spells; other players can still open **Transcribe**

## Installation

1. Copy this folder to `{FoundryData}/modules/npc-spell-book`
2. Enable the module in your world (requires dnd5e)

## Usage

### GM — Create an NPC spellbook

1. Items → **Create Item** → choose **Spellbook**, or right-click a Loot item → **Mark as Spellbook**
2. Open the item sheet (NPC Spellbook)
3. Drag wizard spells from the sidebar/compendiums onto the sheet, or use **Add Spell** (CPR/GPS packs are grouped when present; **Homebrew** lists world Items spells — the GM confirms which count as wizard spells)

### Player — Transcribe spells

1. Open the spellbook (or right-click in Items directory → **Study Spellbook**)
2. Select your wizard character
3. Spells above your max level are blocked; spells already on the actor show as **In Spellbook**
4. Click **Transcribe** and confirm (wealth is checked/deducted across all coin types if settings allow)

### View transcribed spells

On any wizard PC sheet, click **Transcribed Spells** in the header.

## Module Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Deduct Gold on Transcription | On | Deducts 50 gp × spell level from the wizard's total currency (all denominations) |
| Require Sufficient Gold | On | Blocks transcription unless the wizard's total coin wealth covers the ink cost |

## Development

```
npc-spell-book/
├── module.json
├── scripts/
│   ├── main.js
│   ├── data.js
│   ├── mechanics.js
│   ├── spellbook-sheet.js
│   ├── spellbook-compendium.js
│   ├── spell-tooltip.js
│   ├── transcribe-dialog.js
│   └── learn-dialog.js
├── templates/
│   ├── spellbook-sheet.hbs
│   ├── transcribe-spells.hbs
│   ├── spell-picker.hbs
│   └── …
├── lang/en.json
└── styles/spellbook.css
```

Symlink the folder into your Foundry modules directory for live reload during development.

## License

MIT
