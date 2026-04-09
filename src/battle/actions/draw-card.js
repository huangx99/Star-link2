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

  const serial = actor.nextCardNumber;
  const maxSerial = PLAYER_DECK_SIZE;

  if (serial > maxSerial) {
    throw new Error(`${actor.name} 已无可抽取卡牌`);
  }

  actor.hand.push(createCard(actorId, serial));
  actor.handCount = actor.hand.length;
  actor.deckSize -= 1;
  actor.nextCardNumber += 1;

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

module.exports = {
  runDrawCard,
};
