<div class="study-spellbook dnd5e2 flexcol">
  <!-- Top Non-Scrolling Content -->
  <div class="study-header-container flexcol">
    <!-- Wizard Selection Section -->
    <section class="wizard-select">
      <h3>{{localize "NPC_SPELLBOOK.Learn.SelectWizard"}}</h3>
      {{#if wizards.length}}
      <ul class="wizard-list">
        {{#each wizards as |w|}}
        <li>
          <button type="button" class="btn {{#if w.selected}}active{{/if}}" data-action="selectWizard" data-wizard-id="{{w.id}}">
            {{w.name}}
          </button>
        </li>
        {{/each}}
      </ul>
      {{else}}
      <p class="hint">Assign a wizard PC to your user, or ensure party wizards are owned by players.</p>
      {{/if}}
    </section>

    {{#if hasWizard}}
    <section class="wizard-summary">
      <span><strong>Level:</strong> {{wizardLevel}}</span> | 
      <span><strong>Max Spell Level:</strong> {{maxLevel}}</span>
    </section>
    {{/if}}
  </div>

  <!-- Scrollable Spells Section -->
  <section class="spell-study-list spellbook-spells flex1">
    {{#if spellGroups.length}}
      {{#each spellGroups as |group|}}
      <div class="spell-group">
        <!-- Group Header Bar matching Spellbook Sheet layout -->
        <div class="items-header spell-header flexrow">
          <span class="group-label flex2">
            <button type="button" class="sort-btn {{#if (eq ../sortBy 'name')}}active{{/if}}" data-action="sort" data-sort-by="name">
              {{group.label}} {{#if (eq ../sortBy 'name')}}<i class="fas fa-sort-{{#if (eq ../sortDir 'asc')}}up{{else}}down{{/if}}"></i>{{/if}}
            </button>
          </span>
          <span class="column-title study-cost">
            <button type="button" class="sort-btn {{#if (eq ../sortBy 'level')}}active{{/if}}" data-action="sort" data-sort-by="level">
              COST {{#if (eq ../sortBy 'level')}}<i class="fas fa-sort-{{#if (eq ../sortDir 'asc')}}up{{else}}down{{/if}}"></i>{{/if}}
            </button>
          </span>
          <span class="column-title study-time">TIME</span>
          <span class="column-title study-status">
            <button type="button" class="sort-btn {{#if (eq ../sortBy 'availability')}}active{{/if}}" data-action="sort" data-sort-by="availability">
              STATUS {{#if (eq ../sortBy 'availability')}}<i class="fas fa-sort-{{#if (eq ../sortDir 'asc')}}up{{else}}down{{/if}}"></i>{{/if}}
            </button>
          </span>
        </div>

        <!-- Spell Items in Group -->
        <ol class="study-list spell-list">
          {{#each group.spells as |spell|}}
          <li class="study-entry spell-entry flexrow {{#if spell.canLearn}}learnable{{else}}blocked{{/if}}" data-spell-uuid="{{spell.uuid}}">
            
            <!-- Spell Image, Name & Components Column -->
            <div class="item-name flexrow flex2">
              <img class="item-image" src="{{spell.img}}" alt="{{spell.name}}">
              <div class="name-container">
                <span class="spell-name">{{spell.name}}</span>
                {{#if spell.components}}
                <span class="spell-components">{{spell.components}}</span>
                {{/if}}
              </div>
            </div>

            <!-- Cost Column -->
            <span class="item-detail study-cost">
              {{spell.cost}} gp
            </span>

            <!-- Time Column -->
            <span class="item-detail study-time">
              {{spell.hours}} {{#if (eq spell.hours 1)}}hour{{else}}hours{{/if}}
            </span>

            <!-- Status / Action Column -->
            <div class="item-detail study-status">
              {{#if spell.canLearn}}
              <button type="button" class="btn transcribe-btn" data-action="transcribe">
                <i class="fas fa-feather-alt"></i> {{localize "NPC_SPELLBOOK.Actions.TranscribeSpell"}}
              </button>
              {{else}}
              <span class="status-reason">{{spell.statusLabel}}</span>
              {{/if}}
            </div>

          </li>
          {{/each}}
        </ol>
      </div>
      {{/each}}
    {{else}}
      <p class="empty-hint">{{localize "NPC_SPELLBOOK.Sheet.EmptySpells"}}</p>
    {{/if}}
  </section>
</div>
