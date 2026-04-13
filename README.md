# NPC Spellbook v0.2.1

This version uses an actor-driven workflow.

## What it does
- Checks whether an actor is a Wizard or multiclassed Wizard.
- Looks for an equipped item named `Spell book of <actor name>`.
- If no spellbook exists, creates one in the actor's inventory.
- If a spellbook exists, reconciles it against the actor's current spell list.
- Reads the dnd5e rules-version setting (`modern` or `legacy`) and stores it on the spellbook.
- Checks the wizard's baseline minimum spellbook size:
  - 6 spells at wizard level 1
  - +2 spells per wizard level after 1st

## How to use
- Right-click a wizard actor and choose **Generate / Sync Spellbook**
- Or click the **Spellbook** button on a wizard actor sheet
