const { getCardTemplate } = require("./catalog");

function createCard(ownerId, serial, archetypeKey) {
  const template = getCardTemplate(ownerId, serial, archetypeKey);

  return {
    id: `${ownerId}-card-${serial}`,
    key: template.key,
    name: template.name,
    cost: template.cost,
    type: template.type,
    kind: template.kind,
    damage: template.damage ?? 0,
    block: template.block ?? 0,
    heal: template.heal ?? 0,
    energyGain: template.energyGain ?? 0,
    statusEffects: structuredClone(template.statusEffects ?? []),
    cleanseEffects: structuredClone(template.cleanseEffects ?? []),
    convertEffects: structuredClone(template.convertEffects ?? []),
    statusBurstEffects: structuredClone(template.statusBurstEffects ?? []),
    summary: template.summary,
    description: template.description,
    accent: template.accent,
    artLabel: template.artLabel,
    art: template.art ?? null,
  };
}

module.exports = {
  createCard,
};
