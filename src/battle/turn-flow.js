const { PLAYER_MAX_EP_CAP, TURN_DRAW_CAP, TURN_END_HAND_LIMIT } = require("./constants");
const { runDrawCards } = require("./actions/draw-card");
const { discardRandomCardsToLimit } = require("./actions/discard-card");
const { resetShield } = require("./effects/health");
const { getEnemyIntentForState } = require("./enemy-intents");

function beginSelfTurn(state, options = {}) {
  const { drawCard = false, summaryPrefix = "", suppressLastAction = false } = options;
  const self = state.players.self;
  const parts = [];
  let drawnCards = [];
  let discardedCards = [];

  if (state.currentTurn === "self") {
    discardedCards = discardRandomCardsToLimit(state, "self", TURN_END_HAND_LIMIT);

    if (discardedCards.length) {
      parts.push(`${self.name}随机弃置${discardedCards.length}张手牌`);
    }
  }

  resetShield(self);
  self.maxEp = Math.min(PLAYER_MAX_EP_CAP, self.maxEp + 1);
  self.ep = self.maxEp;
  state.currentTurn = "self";

  if (summaryPrefix) {
    parts.push(summaryPrefix);
  }

  if (drawCard) {
    drawnCards = runDrawCards(state, "self", state.nextTurnDrawCount, { suppressLastAction: true });
    state.nextTurnDrawCount = Math.min(TURN_DRAW_CAP, state.nextTurnDrawCount + 1);

    if (drawnCards.length) {
      parts.push(`${self.name}抽了${drawnCards.length}张牌`);
    } else {
      parts.push(`${self.name}已无可抽取卡牌`);
    }
  }

  state.enemyIntent = getEnemyIntentForState(state);

  const summary = parts.join("，") || `第 ${state.turn} 回合开始`;

  if (!suppressLastAction) {
    state.lastAction = {
      type: "turn-start",
      actorId: "self",
      targetId: "self",
      summary,
      discardedCards,
    };
  }

  return {
    state,
    drawnCards,
    discardedCards,
    summary,
  };
}

module.exports = {
  beginSelfTurn,
};
