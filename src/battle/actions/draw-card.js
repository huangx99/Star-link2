const { PLAYER_DECK_SIZE } = require("../constants");
const { createCard } = require("../cards/factory");

function runDrawCard(state, actorId, options = {}) {
  const actor = state.players[actorId];
  const { suppressLastAction = false } = options;

  if (!actor) {
    throw new Error("Invalid draw actor");
  }

  if (actor.deckSize <= 0) {
    throw new Error(`${actor.name} 已无剩余牌组`);
  }

  const drawIndex = Math.max(0, Number(actor.nextDeckIndex) || 0);
  const serial = actor.deckOrder?.[drawIndex];

  if (!serial || drawIndex >= PLAYER_DECK_SIZE) {
    throw new Error(`${actor.name} 已无可抽取卡牌`);
  }

  actor.hand.push(createCard(actorId, serial, actor.deckArchetype?.key));
  actor.handCount = actor.hand.length;
  actor.deckSize -= 1;
  actor.nextDeckIndex = drawIndex + 1;

  if (!suppressLastAction) {
    state.lastAction = {
      type: "draw-card",
      actorId,
      targetId: actorId,
      summary: `${actor.name} 抽了 1 张牌`,
    };
  }

  return state;
}

function runDrawCards(state, actorId, count, options = {}) {
  const drawCount = Math.max(0, Number(count) || 0);
  const actor = state.players[actorId];
  const { suppressLastAction = false } = options;
  const drawnCards = [];

  if (!actor) {
    throw new Error("Invalid draw actor");
  }

  for (let index = 0; index < drawCount; index += 1) {
    try {
      runDrawCard(state, actorId, { suppressLastAction: true });
      drawnCards.push(actor.hand[actor.hand.length - 1] || null);
    } catch (error) {
      if (/已无/.test(error.message)) {
        break;
      }

      throw error;
    }
  }

  if (!suppressLastAction && drawnCards.length) {
    state.lastAction = {
      type: "draw-card",
      actorId,
      targetId: actorId,
      summary: `${actor.name} 抽了 ${drawnCards.length} 张牌`,
    };
  }

  return drawnCards.filter(Boolean);
}

module.exports = {
  runDrawCard,
  runDrawCards,
};
