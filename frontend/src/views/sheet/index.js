// Registro de pestañas de la ficha. Para añadir una pestaña: crea su módulo
// con render(ctx) y sus acciones, y regístrala aquí.

import { renderSummary, summaryActions } from './summary.js';
import { renderProgression, progressionActions, progressionChanges } from './progression.js';
import { renderFeatures, featuresActions } from './features.js';
import { renderEquipment, equipmentActions } from './equipment.js';
import { renderSpells, spellsActions } from './spells.js';
import { renderStory, storyActions } from './story.js';
import { renderDm, extrasActions } from './extras.js';
import { renderCompanions, companionActions } from './companions.js';
import { backgroundActions } from './background.js';
import { contentStatus } from '../../content/snapshots.js';

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
  { id: 'criaturas', label: 'Criaturas', render: renderCompanions, visible: ({ character, sheet, readOnly }) => !readOnly || sheet.bloodSummoning || (character.companions ?? []).length > 0 },
  { id: 'historia', label: 'Historia', render: renderStory },
  { id: 'dm', label: 'Campaña', render: renderDm, visible: ({ character, readOnly }) => !readOnly || character.epicBoons.length > 0 || Boolean(character.campaign),
    attention: ({ character }) => contentStatus(character).some((i) => i.state === 'retirado' || i.state === 'desconocido') },
];

export const ACTIONS = {
  ...summaryActions,
  ...progressionActions,
  ...featuresActions,
  ...equipmentActions,
  ...spellsActions,
  ...storyActions,
  ...extrasActions,
  ...companionActions,
  ...backgroundActions,
};

export const CHANGES = progressionChanges;
