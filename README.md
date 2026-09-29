# NPC Spellbook (Foundry v13)

A Foundry VTT module for **D&D 5e (2014)** that adds lootable NPC wizard spellbooks. Wizards can transcribe spells using Player's Handbook rules, stored **independently** of the dnd5e system spellbook.

## Requirements

- Foundry VTT **v13.351+**
- [D&D 5e system](https://github.com/foundryvtt/dnd5e) **3.0+**

## Features

- Create **Spellbook** loot items (Create Item dialog or right-click → Mark as Spellbook)
- GM manages NPC spell lists via drag-and-drop or compendium browser
- Wizards **Study Spellbook** to transcribe spells
- **5e 2014 mechanics** enforced by wizard level:
  - Max spell level = `ceil(wizard level / 2)` (PHB spell slot progression)
  - Cost: **50 gp per spell level**
  - Time: **2 hours per spell level**
- Transcribed spells stored in module flags on the wizard (`Transcribed Spells` button on character sheet)
- Does **not** modify the built-in dnd5e spellbook or spell preparation

## Installation

1. Copy this folder to `{FoundryData}/modules/npc-spell-book`
2. Enable the module in your world (requires dnd5e)

## Usage

### GM — Create an NPC spellbook

1. Items → **Create Item** → choose **Spellbook**, or right-click a Loot item → **Mark as Spellbook**
2. Open the item sheet (NPC Spellbook)
3. Drag spells from compendiums onto the list, or use **Add Spell**

### Player — Transcribe spells

1. Open the spellbook (or right-click in Items directory → **Study Spellbook**)
2. Select your wizard character
3. Spells above your max level are blocked automatically
4. Click **Transcribe Spell** and confirm (gold is deducted if settings allow)

### View transcribed spells

On any wizard PC sheet, click **Transcribed Spells** in the header.

## Module Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Deduct Gold on Transcription | On | Removes 50 gp × spell level when transcribing |
| Require Sufficient Gold | On | Blocks transcription if the wizard cannot afford ink |

## Development

```
Projects/npc-spell-book/
├── module.json
├── scripts/
│   ├── main.js
│   ├── data.js
│   ├── mechanics.js
│   ├── spellbook-sheet.js
│   └── learn-dialog.js
├── templates/
├── lang/en.json
└── styles/spellbook.css
```

Symlink the folder into your Foundry modules directory for live reload during development.

## License

MIT
