const { TURN_DRAW_CAP } = require("./constants");
const { runDrawCards } = require("./actions/draw-card");
const { resetShield } = require("./effects/health");
const { getEnemyIntentForState } = require("./enemy-intents");

function beginSelfTurn(state, options = {}) {
  const { drawCard = false, summaryPrefix = "", suppressLastAction = false } = options;
  const self = state.players.self;
  const parts = [];
  let drawnCards = [];

  resetShield(self);
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
    };
  }

  return {
    state,
    drawnCards,
    summary,
  };
}

module.exports = {
  beginSelfTurn,
};
