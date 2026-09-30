async _loadSpellsFromSelectedPacks() {
    this.cachedSpells = [];
    if (this.selectedPacks.size === 0) return;

    for (const packId of this.selectedPacks) {
      const pack = game.packs.get(packId);
      if (!pack) continue;

      const docs = await pack.getDocuments();

      for (const item of docs) {
        if (item.type !== "spell") continue;

        const level = Number(item.system?.level ?? 0);
        if (level === 0) continue; // Skip cantrips

        // Extract class metadata across different DND5e system versions and modules
        const sourceItem = String(item.system?.sourceItem ?? item.system?._source?.sourceClass ?? "").toLowerCase();
        const spellcastingClass = String(item.system?.spellcastingClass ?? item.labels?.spellcastingClass ?? "").toLowerCase();
        
        // D&D 5e v3.x / v4.x Set or Array data for classes
        const classesSet = item.system?.classes;
        let classesArray = [];
        if (classesSet instanceof Set) {
          classesArray = Array.from(classesSet);
        } else if (Array.isArray(classesSet)) {
          classesArray = classesSet;
        } else if (typeof classesSet === "object" && classesSet !== null) {
          classesArray = Object.keys(classesSet);
        }

        // Check explicit class indicators
        const isWizardExplicit =
          sourceItem.includes("wizard") ||
          spellcastingClass.includes("wizard") ||
          classesArray.some((c) => String(c).toLowerCase().includes("wizard")) ||
          Boolean(item.system?.properties?.has?.("wizard"));

        // Fallback: If no explicit class array exists on the item, check core system list or registry if available
        let isWizardSystemList = false;
        if (!isWizardExplicit && classesArray.length === 0 && !sourceItem && !spellcastingClass) {
          if (CONFIG.DND5E?.spellComps?.wizard?.has?.(item.identifier ?? item.name.slugify())) {
            isWizardSystemList = true;
          }
        }

        const isWizardSpell = isWizardExplicit || isWizardSystemList;

        if (isWizardSpell) {
          this.cachedSpells.push({
            id: item.id,
            uuid: item.uuid,
            name: item.name,
            img: item.img,
            level: level,
            school: item.system?.school ?? "",
            components: item.labels?.components?.vsm ?? "",
            packTitle: pack.metadata.label,
            itemDoc: item
          });
        }
      }
    }
  }
