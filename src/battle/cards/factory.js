const { getCardTemplate } = require("./catalog");

function createCard(ownerId, serial) {
  const template = getCardTemplate(serial);

  return {
    id: `${ownerId}-card-${serial}`,
    key: template.key,
    name: template.name,
    cost: template.cost,
    type: template.type,
    kind: template.kind,
    damage: template.damage ?? 0,
    block: template.block ?? 0,
    energyGain: template.energyGain ?? 0,
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
