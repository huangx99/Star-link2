const { getEnemyIntentForState } = require("../enemy-intents");
const { canPlayCard, resolveCardEffect } = require("../cards/logic");

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

  const defeated = effect.kind === "attack" && target.hp <= 0;
  let summary = "";

  if (effect.kind === "attack") {
    summary = defeated
      ? `${actor.name}打出${playedCard.name}，对${target.name}造成${effect.dealtDamage}点伤害并完成击败`
      : `${actor.name}打出${playedCard.name}，对${target.name}造成${effect.dealtDamage}点伤害`;

    if (effect.blockedDamage > 0) {
      summary += `，其中${effect.blockedDamage}点被护盾吸收`;
    }
  } else if (effect.kind === "defend") {
    summary = `${actor.name}打出${playedCard.name}，获得${effect.block}点护盾`;
  } else {
    summary = `${actor.name}打出${playedCard.name}，回复${effect.energyGain}点能量`;
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
