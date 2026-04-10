const { PLAYER_DECK_SIZE, PLAYER_MAX_EP_CAP } = require("./constants");
const { createCard } = require("./cards/factory");
const { gainEnergy, spendAvailableEnergy } = require("./effects/energy");
const { spendShield } = require("./effects/health");
const { applyStatus, clearStatuses, getModifiedDamage, spendStatusStacks } = require("./effects/statuses");

function peekNextDrawCards(player, count = 1) {
  if (!player) {
    return [];
  }

  const drawCount = Math.max(0, Number(count) || 0);
  const cards = [];

  for (let index = 0; index < drawCount; index += 1) {
    const deckIndex = (player.nextDeckIndex || 0) + index;
    const serial = player.deckOrder?.[deckIndex];

    if (player.deckSize - index <= 0 || !serial || deckIndex >= PLAYER_DECK_SIZE) {
      break;
    }

    cards.push(createCard(player.id, serial, player.deckArchetype?.key));
  }

  return cards;
}

function createSimState(actor, target) {
  return {
    actor: structuredClone(actor),
    target: structuredClone(target),
    totalDamage: 0,
    totalBlock: 0,
    totalEnergyGain: 0,
    totalHeal: 0,
    totalStatusPressure: 0,
    plays: [],
  };
}

function getIncomingThreatEstimate(player, target) {
  const attackCards = (player?.hand ?? []).filter(
    (card) => (card.damage ?? 0) > 0 || (card.convertEffects?.length ?? 0) > 0
  );
  const affordableCount = Math.min(Math.max(1, (player?.maxEp ?? 1) + 1), attackCards.length);

  return attackCards
    .sort(
      (left, right) =>
        estimateCardDamage(player, target, right) - estimateCardDamage(player, target, left)
    )
    .slice(0, affordableCount)
    .reduce((sum, card) => sum + estimateCardDamage(player, target, card), 0);
}

function resolveConversionParticipant(actor, target, role) {
  return role === "target" ? target : actor;
}

function estimateCardDamage(actor, target, card) {
  let totalDamage = Math.max(0, Number(card.damage) || 0);

  (card.convertEffects ?? []).forEach((convertEffect) => {
    if (!["shield", "energy"].includes(convertEffect.resource) || convertEffect.to !== "damage") {
      return;
    }

    const sourcePlayer = convertEffect.source === "target" ? null : actor;

    if (!sourcePlayer) {
      return;
    }

    const availableAmount =
      convertEffect.resource === "shield"
        ? Math.max(0, Number(sourcePlayer.shield) || 0)
        : Math.max(0, Number(sourcePlayer.ep) || 0);
    const requestedAmount =
      convertEffect.mode === "all"
        ? availableAmount
        : Math.max(0, Number(convertEffect.amount) || 0);
    const spent = Math.min(availableAmount, requestedAmount);
    const multiplier = Number(convertEffect.multiplier) || 1;
    const bonus = Math.max(0, Number(convertEffect.bonus) || 0);
    totalDamage += Math.max(0, Math.floor(spent * multiplier) + bonus);
  });

  (card.statusBurstEffects ?? []).forEach((burstEffect) => {
    if (burstEffect.to !== "damage") {
      return;
    }

    const sourcePlayer = burstEffect.source === "target" ? target : actor;

    if (!sourcePlayer) {
      return;
    }

    const availableStacks =
      sourcePlayer.statuses?.find((status) => status.key === burstEffect.key)?.stacks ?? 0;
    const requestedAmount =
      burstEffect.mode === "all"
        ? availableStacks
        : Math.max(0, Number(burstEffect.amount) || 0);
    const spent = Math.min(availableStacks, requestedAmount);
    const multiplier = Number(burstEffect.multiplier) || 1;
    const bonus = Math.max(0, Number(burstEffect.bonus) || 0);
    totalDamage += Math.max(0, Math.floor(spent * multiplier) + bonus);
  });

  return getModifiedDamage(actor, totalDamage);
}

function applySimulatedDamage(actor, damageTarget, amount, play, nextState) {
  const rawDamage = getModifiedDamage(actor, amount);

  if (rawDamage <= 0) {
    return;
  }

  const blockedDamage = Math.min(damageTarget.shield || 0, rawDamage);
  const hpDamage = rawDamage - blockedDamage;

  damageTarget.shield = Math.max(0, (damageTarget.shield || 0) - blockedDamage);
  damageTarget.hp = Math.max(0, damageTarget.hp - hpDamage);
  play.damage += rawDamage;

  if (damageTarget.id === nextState.target.id) {
    nextState.totalDamage += hpDamage;
  }
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
    heal: 0,
    energyGain: 0,
    appliedStatuses: [],
    removedStatuses: [],
    resourceConversions: [],
    statusBursts: [],
  };

  for (const convertEffect of card.convertEffects ?? []) {
    if (!["shield", "energy"].includes(convertEffect.resource) || convertEffect.to !== "damage") {
      continue;
    }

    const sourcePlayer = resolveConversionParticipant(actor, target, convertEffect.source);
    const damageTarget = resolveConversionParticipant(actor, target, convertEffect.target);
    const availableAmount =
      convertEffect.resource === "shield"
        ? Math.max(0, Number(sourcePlayer.shield) || 0)
        : Math.max(0, Number(sourcePlayer.ep) || 0);
    const requestedAmount =
      convertEffect.mode === "all"
        ? availableAmount
        : Math.max(0, Number(convertEffect.amount) || 0);
    const spent =
      convertEffect.resource === "shield"
        ? spendShield(sourcePlayer, requestedAmount)
        : spendAvailableEnergy(sourcePlayer, requestedAmount);

    if (spent <= 0) {
      continue;
    }

    const multiplier = Number(convertEffect.multiplier) || 1;
    const bonus = Math.max(0, Number(convertEffect.bonus) || 0);
    const produced = Math.max(0, Math.floor(spent * multiplier) + bonus);

    play.resourceConversions.push({
      sourceRole: sourcePlayer.id,
      targetRole: damageTarget.id,
      resource: convertEffect.resource,
      to: "damage",
      spent,
      produced,
    });

    applySimulatedDamage(actor, damageTarget, produced, play, nextState);
  }

  for (const burstEffect of card.statusBurstEffects ?? []) {
    if (burstEffect.to !== "damage") {
      continue;
    }

    const sourcePlayer = resolveConversionParticipant(actor, target, burstEffect.source);
    const damageTarget = resolveConversionParticipant(actor, target, burstEffect.target);
    const consumedStatus = spendStatusStacks(sourcePlayer, burstEffect.key, {
      mode: burstEffect.mode,
      amount: burstEffect.amount,
    });

    if (!consumedStatus || consumedStatus.spent <= 0) {
      continue;
    }

    const multiplier = Number(burstEffect.multiplier) || 1;
    const bonus = Math.max(0, Number(burstEffect.bonus) || 0);
    const produced = Math.max(0, Math.floor(consumedStatus.spent * multiplier) + bonus);

    play.statusBursts.push({
      sourceRole: sourcePlayer.id,
      targetRole: damageTarget.id,
      key: consumedStatus.key,
      label: consumedStatus.label,
      kind: consumedStatus.kind,
      spent: consumedStatus.spent,
      produced,
      to: "damage",
    });

    if (damageTarget.id === target.id) {
      nextState.totalStatusPressure += produced;
    }

    applySimulatedDamage(actor, damageTarget, produced, play, nextState);
  }

  if ((card.damage ?? 0) > 0) {
    applySimulatedDamage(actor, target, card.damage ?? 0, play, nextState);
  }

  if ((card.block ?? 0) > 0) {
    actor.shield = Math.max(0, actor.shield || 0) + Math.max(0, card.block ?? 0);
    play.block = Math.max(0, card.block ?? 0);
    nextState.totalBlock += play.block;
  }

  if ((card.energyGain ?? 0) > 0) {
    play.energyGain = gainEnergy(actor, card.energyGain ?? 0);
    nextState.totalEnergyGain += play.energyGain;
  }

  if ((card.heal ?? 0) > 0) {
    const previousHp = actor.hp;
    actor.hp = Math.min(actor.maxHp, actor.hp + Math.max(0, card.heal ?? 0));
    play.heal = Math.max(0, actor.hp - previousHp);
    nextState.totalHeal += play.heal;
  }

  for (const statusEffect of card.statusEffects ?? []) {
    const statusTarget = statusEffect.target === "target" ? target : actor;
    const appliedStatus = applyStatus(statusTarget, statusEffect.key, {
      stacks: statusEffect.stacks,
      duration: statusEffect.duration,
      permanent: statusEffect.permanent,
    });

    play.appliedStatuses = play.appliedStatuses || [];
    play.appliedStatuses.push({
      targetRole: statusTarget.id,
      status: appliedStatus,
    });

    if (statusTarget.id === target.id) {
      if (statusEffect.key === "poison") {
        nextState.totalStatusPressure += (statusEffect.stacks ?? 1) * 7;
      } else if (statusEffect.key === "weaken") {
        nextState.totalStatusPressure += (statusEffect.stacks ?? 1) * 5;
      }
    } else if (statusTarget.id === actor.id) {
      if (statusEffect.key === "sharpness") {
        nextState.totalStatusPressure += (statusEffect.stacks ?? 1) * 6;
      } else if (statusEffect.key === "regen") {
        nextState.totalStatusPressure += (statusEffect.stacks ?? 1) * 5;
      }
    }
  }

  for (const cleanseEffect of card.cleanseEffects ?? []) {
    const cleanseTarget = cleanseEffect.target === "target" ? target : actor;
    const removedStatuses = clearStatuses(
      cleanseTarget,
      {
        kind: cleanseEffect.kind,
        key: cleanseEffect.key,
      },
      {
        count: cleanseEffect.count,
        includePermanent: cleanseEffect.includePermanent,
      }
    );

    if (removedStatuses.length) {
      play.removedStatuses = play.removedStatuses || [];
      removedStatuses.forEach((status) => {
        play.removedStatuses.push({
          targetRole: cleanseTarget.id,
          status,
        });
      });

      nextState.totalStatusPressure += removedStatuses.length * 4;
    }
  }

  if (
    play.damage <= 0 &&
    play.block <= 0 &&
    play.energyGain <= 0 &&
    (play.heal ?? 0) <= 0 &&
    (play.appliedStatuses?.length ?? 0) <= 0 &&
    (play.removedStatuses?.length ?? 0) <= 0 &&
    (play.resourceConversions?.length ?? 0) <= 0 &&
    (play.statusBursts?.length ?? 0) <= 0
  ) {
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
    simState.totalHeal * 12 +
    simState.totalEnergyGain * 8 +
    simState.totalStatusPressure +
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
  const enemyTurnStateReady = options.enemyTurnStateReady === true;
  const drawCount = Math.max(0, Number(options.drawCount ?? state.nextTurnDrawCount ?? 1) || 0);
  const enemy = structuredClone(state.players.enemy);
  const self = structuredClone(state.players.self);

  if (!enemyTurnStateReady) {
    enemy.maxEp = Math.min(PLAYER_MAX_EP_CAP, enemy.maxEp + 1);
    enemy.ep = enemy.maxEp;
    enemy.shield = 0;
  }

  let drawnCards = [];

  if (simulateDraw) {
    drawnCards = peekNextDrawCards(enemy, drawCount);
    enemy.hand.push(...drawnCards);
    enemy.handCount = enemy.hand.length;
    enemy.deckSize = Math.max(0, enemy.deckSize - drawnCards.length);
    enemy.nextDeckIndex = (enemy.nextDeckIndex || 0) + drawnCards.length;
  }

  const context = {
    incomingThreat: getIncomingThreatEstimate(self, enemy),
    targetMaxHp: self.maxHp,
  };
  const bestState = searchBestSequence(createSimState(enemy, self), context);

  return {
    draws: drawnCards.map((card) => ({
      cardId: card.id,
      card,
    })),
    plays: bestState.plays,
    intent: formatIntent(bestState),
  };
}

module.exports = {
  planEnemyTurn,
};
