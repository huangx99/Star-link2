const { gainEnergy, hasEnoughEnergy, spendEnergy } = require("../effects/energy");
const { applyDamage, gainShield } = require("../effects/health");

function canPlayCard(player, card) {
  return Boolean(player && card && hasEnoughEnergy(player, card.cost));
}

function resolveCardEffect(actor, target, card) {
  if (!actor || !target || !card) {
    throw new Error("Invalid card effect");
  }

  spendEnergy(actor, card.cost);

  switch (card.kind) {
    case "attack": {
      const damageResult = applyDamage(target, card.damage);

      return {
        kind: "attack",
        damage: card.damage,
        dealtDamage: damageResult.hpDamage,
        blockedDamage: damageResult.blockedDamage,
        targetRole: target.id,
      };
    }
    case "defend":
      gainShield(actor, card.block);
      return {
        kind: "defend",
        block: card.block,
        targetRole: actor.id,
      };
    case "energize":
      return {
        kind: "energize",
        energyGain: gainEnergy(actor, card.energyGain),
        targetRole: actor.id,
      };
    default:
      throw new Error(`Unsupported card kind: ${card.kind}`);
  }
}

module.exports = {
  canPlayCard,
  resolveCardEffect,
};
