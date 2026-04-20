function createEnemySkill(enemyId, template) {
  return {
    id: `${enemyId}-skill-${template.key}`,
    key: template.key,
    name: template.name,
    cost: template.cost ?? 0,
    type: template.type,
    kind: template.kind,
    damage: template.damage ?? 0,
    block: template.block ?? 0,
    heal: template.heal ?? 0,
    energyGain: template.energyGain ?? 0,
    cooldown: Math.max(0, Number(template.cooldown) || 0),
    statusEffects: structuredClone(template.statusEffects ?? []),
    cleanseEffects: structuredClone(template.cleanseEffects ?? []),
    convertEffects: structuredClone(template.convertEffects ?? []),
    statusBurstEffects: structuredClone(template.statusBurstEffects ?? []),
    summary: template.summary,
    description: template.description,
    accent: template.accent,
    artLabel: template.artLabel,
    art: template.art ?? null,
    isSkill: true,
  };
}

module.exports = {
  createEnemySkill,
};
