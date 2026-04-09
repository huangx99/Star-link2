const { runDrawCard } = require("./actions/draw-card");
const { PLAYER_MAX_EP_CAP } = require("./constants");
const { resetShield } = require("./effects/health");
const { getEnemyIntentForState } = require("./enemy-intents");

function beginSelfTurn(state, options = {}) {
  const { drawCard = false, summaryPrefix = "", suppressLastAction = false } = options;
  const self = state.players.self;
  const parts = [];
  let drawnCard = null;

  resetShield(self);
  self.maxEp = Math.min(PLAYER_MAX_EP_CAP, self.maxEp + 1);
  self.ep = self.maxEp;
  state.currentTurn = "self";
  state.enemyIntent = getEnemyIntentForState(state);

  if (summaryPrefix) {
    parts.push(summaryPrefix);
  }

  if (drawCard) {
    try {
      runDrawCard(state, "self", { suppressLastAction: true });
      drawnCard = self.hand[self.hand.length - 1] || null;
      parts.push(`${self.name}抽了1张牌`);
    } catch (error) {
      if (/已无/.test(error.message)) {
        parts.push(`${self.name}已无可抽取卡牌`);
      } else {
        throw error;
      }
    }
  }

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
    drawnCard,
    summary,
  };
}

module.exports = {
  beginSelfTurn,
};
