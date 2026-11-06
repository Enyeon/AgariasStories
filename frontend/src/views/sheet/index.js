// Registro de pestañas de la ficha. Para añadir una pestaña: crea su módulo
// con render(ctx) y sus acciones, y regístrala aquí.

import { renderSummary, summaryActions } from './summary.js';
import { renderProgression, progressionActions, progressionChanges } from './progression.js';
import { renderFeatures, featuresActions } from './features.js';
import { renderEquipment, equipmentActions } from './equipment.js';
import { renderSpells, spellsActions } from './spells.js';
import { renderStory, storyActions } from './story.js';
import { renderBloodCreatures, renderDm, extrasActions } from './extras.js';
import { backgroundActions } from './background.js';

export const TABS = [
  { id: 'resumen', label: 'Resumen', render: renderSummary },
  {
    id: 'progresion', label: 'Progresión', render: renderProgression,
    attention: ({ character, sheet }) => !character.race.key || sheet.level === 0 || sheet.pendingRaceChoices || sheet.pendingBackground
      || sheet.languages.chosen.length < sheet.languages.picks,
  },
  { id: 'rasgos', label: 'Rasgos', render: renderFeatures },
  {
    id: 'conjuros', label: 'Conjuros', render: renderSpells, needsSpells: true,
    visible: ({ character, sheet }) => sheet.spellcasting.isCaster || character.spells.known.length > 0,
  },
  { id: 'equipo', label: 'Equipo', render: renderEquipment },
  { id: 'criaturas', label: 'Criaturas de Sangre', render: renderBloodCreatures, visible: ({ sheet }) => sheet.bloodSummoning },
  { id: 'historia', label: 'Historia', render: renderStory },
  { id: 'dm', label: 'DM', render: renderDm, visible: ({ character, readOnly }) => !readOnly || character.settings.allowEpicBoons },
];

export const ACTIONS = {
  ...summaryActions,
  ...progressionActions,
  ...featuresActions,
  ...equipmentActions,
  ...spellsActions,
  ...storyActions,
  ...extrasActions,
  ...backgroundActions,
};

export const CHANGES = progressionChanges;
