const { PLAYER_DECK_SIZE, PLAYER_MAX_EP_CAP } = require("./constants");
const { createCard } = require("./cards/factory");

function peekNextDrawCard(player) {
  if (!player || player.deckSize <= 0 || player.nextCardNumber > PLAYER_DECK_SIZE) {
    return null;
  }

  return createCard(player.id, player.nextCardNumber);
}

function createSimState(actor, target) {
  return {
    actor: structuredClone(actor),
    target: structuredClone(target),
    totalDamage: 0,
    totalBlock: 0,
    totalEnergyGain: 0,
    plays: [],
  };
}

function getIncomingThreatEstimate(player) {
  const attackCards = (player?.hand ?? []).filter((card) => card.kind === "attack");
  const affordableCount = Math.min(Math.max(1, (player?.maxEp ?? 1) + 1), attackCards.length);

  return attackCards
    .sort((left, right) => (right.damage ?? 0) - (left.damage ?? 0))
    .slice(0, affordableCount)
    .reduce((sum, card) => sum + (card.damage ?? 0), 0);
}

function applySimulatedCard(simState, card) {
  const nextState = structuredClone(simState);
  const actor = nextState.actor;
  const target = nextState.target;
  const cardIndex = actor.hand.findIndex((item) => item.id === card.id);

  if (cardIndex < 0 || actor.ep < card.cost) {
    return null;
  }

  actor.hand.splice(cardIndex, 1);
  actor.ep -= card.cost;

  const play = {
    cardId: card.id,
    card,
    kind: card.kind,
    damage: 0,
    block: 0,
    energyGain: 0,
  };

  switch (card.kind) {
    case "attack": {
      const rawDamage = Math.max(0, card.damage ?? 0);
      const blockedDamage = Math.min(target.shield || 0, rawDamage);
      const hpDamage = rawDamage - blockedDamage;

      target.shield = Math.max(0, (target.shield || 0) - blockedDamage);
      target.hp = Math.max(0, target.hp - hpDamage);
      play.damage = rawDamage;
      nextState.totalDamage += hpDamage;
      break;
    }
    case "defend":
      actor.shield = Math.max(0, actor.shield || 0) + Math.max(0, card.block ?? 0);
      play.block = Math.max(0, card.block ?? 0);
      nextState.totalBlock += play.block;
      break;
    case "energize": {
      const beforeEnergy = actor.ep;
      actor.ep = Math.min(actor.maxEp, actor.ep + Math.max(0, card.energyGain ?? 0));
      play.energyGain = actor.ep - beforeEnergy;
      nextState.totalEnergyGain += play.energyGain;
      break;
    }
    default:
      return null;
  }

  nextState.plays.push(play);
  return nextState;
}

function scoreSimState(simState, context) {
  const { incomingThreat, targetMaxHp } = context;
  const lethalBonus = simState.target.hp <= 0 ? 10000 : 0;
  const effectiveShield = Math.min(simState.actor.shield || 0, incomingThreat);
  const lowHpFactor = simState.actor.hp <= Math.max(10, incomingThreat) ? 1.7 : 1;
  const pressureFactor = simState.target.hp <= Math.ceil(targetMaxHp * 0.4) ? 1.35 : 1;

  return (
    lethalBonus +
    simState.totalDamage * 26 * pressureFactor +
    effectiveShield * 14 * lowHpFactor +
    simState.totalBlock * 2 +
    simState.totalEnergyGain * 8 +
    simState.plays.length * 6 -
    simState.actor.ep * 18
  );
}

function searchBestSequence(simState, context) {
  const playableCards = simState.actor.hand.filter((card) => simState.actor.ep >= card.cost);

  if (!playableCards.length) {
    return simState;
  }

  let bestState = simState;
  let bestScore = scoreSimState(simState, context);

  playableCards.forEach((card) => {
    const nextState = applySimulatedCard(simState, card);

    if (!nextState) {
      return;
    }

    const candidate = searchBestSequence(nextState, context);
    const candidateScore = scoreSimState(candidate, context);

    if (candidateScore > bestScore) {
      bestScore = candidateScore;
      bestState = candidate;
    }
  });

  return bestState;
}

function formatIntent(plan) {
  if (!plan.plays.length) {
    return {
      key: "idle",
      label: "观望",
      preview: "准备结束回合",
    };
  }

  const damage = plan.plays.reduce((sum, play) => sum + play.damage, 0);
  const block = plan.plays.reduce((sum, play) => sum + play.block, 0);
  const energyGain = plan.plays.reduce((sum, play) => sum + play.energyGain, 0);
  const previewParts = [];

  if (damage > 0) {
    previewParts.push(`预计伤害 ${damage}`);
  }

  if (block > 0) {
    previewParts.push(`预计护盾 ${block}`);
  }

  if (energyGain > 0) {
    previewParts.push(`预计回能 ${energyGain}`);
  }

  return {
    key: plan.plays.map((play) => play.kind).join("-"),
    label: plan.plays.map((play) => play.card.name).join(" / "),
    preview: previewParts.join(" · "),
  };
}

function planEnemyTurn(state, options = {}) {
  const simulateDraw = options.simulateDraw !== false;
  const enemy = structuredClone(state.players.enemy);
  const self = structuredClone(state.players.self);

  enemy.maxEp = Math.min(PLAYER_MAX_EP_CAP, enemy.maxEp + 1);
  enemy.ep = enemy.maxEp;
  enemy.shield = 0;

  let drawnCard = null;

  if (simulateDraw) {
    drawnCard = peekNextDrawCard(enemy);

    if (drawnCard) {
      enemy.hand.push(drawnCard);
      enemy.handCount = enemy.hand.length;
      enemy.deckSize = Math.max(0, enemy.deckSize - 1);
      enemy.nextCardNumber += 1;
    }
  }

  const context = {
    incomingThreat: getIncomingThreatEstimate(self),
    targetMaxHp: self.maxHp,
  };
  const bestState = searchBestSequence(createSimState(enemy, self), context);

  return {
    draw: drawnCard
      ? {
          cardId: drawnCard.id,
          card: drawnCard,
        }
      : null,
    plays: bestState.plays,
    intent: formatIntent(bestState),
  };
}

module.exports = {
  planEnemyTurn,
};
