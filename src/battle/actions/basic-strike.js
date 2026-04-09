const { applyDamage } = require("../effects/health");
const { gainEnergy, hasEnoughEnergy, spendEnergy } = require("../effects/energy");

const BASIC_STRIKE_DAMAGE = 1;
const BASIC_STRIKE_COST = 1;
const BASIC_STRIKE_REFUND = 0;

function runBasicStrike(state, actorId, targetId) {
  const actor = state.players[actorId];
  const target = state.players[targetId];

  if (!actor || !target) {
    throw new Error("Invalid battle target");
  }

  if (!hasEnoughEnergy(actor, BASIC_STRIKE_COST)) {
    throw new Error(`${actor.name} 能量不足`);
  }

  spendEnergy(actor, BASIC_STRIKE_COST);
  applyDamage(target, BASIC_STRIKE_DAMAGE);
  gainEnergy(target, BASIC_STRIKE_REFUND);

  state.lastAction = {
    type: "basic-strike",
    actorId,
    targetId,
    summary: `${actor.name} 对 ${target.name} 造成 ${BASIC_STRIKE_DAMAGE} 点伤害`,
  };

  return state;
}

module.exports = {
  runBasicStrike,
};
