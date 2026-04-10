const { getEnemyIntentForState } = require("../enemy-intents");
const { canPlayCard, resolveCardEffect } = require("../cards/logic");

function formatStatusSummary(actor, target, effect) {
  const parts = [];

  effect.appliedStatuses?.forEach(({ targetRole, status }) => {
    const targetName = targetRole === actor.id ? actor.name : target.name;
    parts.push(`使${targetName}获得${status.label}${status.stacks}层`);
  });

  if ((effect.removedStatuses?.length ?? 0) > 0) {
    const groupedRemovals = effect.removedStatuses.reduce((map, removed) => {
      const targetRole = removed.targetRole;
      const targetName = targetRole === actor.id ? actor.name : target.name;
      const key = `${targetRole}:${targetName}`;
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    }, new Map());

    groupedRemovals.forEach((count, key) => {
      const [, targetName] = key.split(":");
      parts.push(`清除${targetName}${count}个状态`);
    });
  }

  return parts;
}

function formatConversionSummary(actor, target, effect) {
  const parts = [];

  effect.resourceConversions?.forEach((conversion) => {
    if (conversion.resource !== "shield" || conversion.to !== "damage" || conversion.spent <= 0) {
      return;
    }

    const sourceName = conversion.sourceRole === actor.id ? actor.name : target.name;
    const targetName = conversion.targetRole === actor.id ? actor.name : target.name;
    parts.push(`消耗${sourceName}${conversion.spent}点护盾转为对${targetName}的${conversion.produced}点攻击`);
  });

  return parts;
}

function formatStatusBurstSummary(actor, target, effect) {
  const parts = [];

  effect.statusBursts?.forEach((burst) => {
    if (burst.to !== "damage" || burst.spent <= 0) {
      return;
    }

    const sourceName = burst.sourceRole === actor.id ? actor.name : target.name;
    const targetName = burst.targetRole === actor.id ? actor.name : target.name;
    parts.push(`引爆${sourceName}的${burst.label}${burst.spent}层，转为对${targetName}的${burst.produced}点攻击`);
  });

  return parts;
}

function formatPlayedCardSummary(actor, target, playedCard, effect) {
  const parts = [];

  parts.push(...formatConversionSummary(actor, target, effect));
  parts.push(...formatStatusBurstSummary(actor, target, effect));

  if (effect.damage > 0) {
    const damageSummary =
      effect.dealtDamage > 0
        ? `对${target.name}造成${effect.dealtDamage}点伤害`
        : `对${target.name}发起${effect.damage}点攻击`;
    parts.push(damageSummary);

    if (effect.blockedDamage > 0) {
      parts.push(`其中${effect.blockedDamage}点被护盾吸收`);
    }
  }

  if (effect.block > 0) {
    parts.push(`获得${effect.block}点护盾`);
  }

  if (effect.heal > 0) {
    parts.push(`回复${effect.heal}点生命`);
  }

  if (effect.energyGain > 0) {
    parts.push(`回复${effect.energyGain}点能量`);
  }

  parts.push(...formatStatusSummary(actor, target, effect));

  return `${actor.name}打出${playedCard.name}，${parts.join("，")}`;
}

function runPlayCard(state, actorId, targetId, cardId) {
  const actor = state.players[actorId];
  const target = state.players[targetId];

  if (!actor || !target) {
    throw new Error("Invalid play target");
  }

  if (!cardId) {
    throw new Error("Missing card id");
  }

  if (state.currentTurn !== actorId) {
    throw new Error("当前不是你的回合");
  }

  const cardIndex = actor.hand.findIndex((card) => card.id === cardId);

  if (cardIndex < 0) {
    throw new Error("Card not found in hand");
  }

  const selectedCard = actor.hand[cardIndex];

  if (!canPlayCard(actor, selectedCard)) {
    throw new Error(`${actor.name} 能量不足`);
  }

  const [playedCard] = actor.hand.splice(cardIndex, 1);

  actor.handCount = actor.hand.length;
  actor.discardCount += 1;
  const effect = resolveCardEffect(actor, target, playedCard);

  const defeated = effect.damage > 0 && target.hp <= 0;
  let summary = formatPlayedCardSummary(actor, target, playedCard, effect);

  if (defeated) {
    summary += "并完成击败";
  }

  state.lastAction = {
    type: "play-card",
    actorId,
    targetId,
    cardId,
    card: playedCard,
    effect,
    summary,
  };

  if (defeated) {
    state.winner = actorId;
    state.currentTurn = null;
    state.enemyIntent = null;
    return state;
  }

  state.enemyIntent = getEnemyIntentForState(state);

  return state;
}

module.exports = {
  runPlayCard,
};
