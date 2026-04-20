const { ACTION_TYPES } = require("./constants");
const { runBasicStrike } = require("./actions/basic-strike");
const { runDrawCard } = require("./actions/draw-card");
const { runEndTurn } = require("./actions/end-turn");
const { runPlayCard } = require("./actions/play-card");
const { cloneBattleState, createBattleState } = require("./state");
const { getOwnerArchetypes } = require("./cards/catalog");
const { getBossProfiles } = require("./enemies/catalog");

let battleState = createBattleState();

function getBattleState() {
  return cloneBattleState(battleState);
}

function resetBattleState(options = {}) {
  battleState = createBattleState(options);
  return getBattleState();
}

function getBattleConfig() {
  return {
    selfArchetypes: getOwnerArchetypes("self").map((archetype) => ({
      key: archetype.key,
      label: archetype.label,
      description: archetype.description,
    })),
    enemyArchetypes: getBossProfiles().map((boss) => ({
      key: boss.key,
      label: boss.label,
      description: boss.description,
    })),
  };
}

function ensureBattleActive() {
  if (battleState.winner) {
    throw new Error("战斗已结束，请重置");
  }
}

function performBattleAction({ type, actorId, targetId, cardId }) {
  if (type !== ACTION_TYPES.DRAW_CARD) {
    ensureBattleActive();
  }

  switch (type) {
    case ACTION_TYPES.BASIC_STRIKE:
      runBasicStrike(battleState, actorId, targetId);
      return getBattleState();
    case ACTION_TYPES.DRAW_CARD:
      runDrawCard(battleState, actorId);
      return getBattleState();
    case ACTION_TYPES.END_TURN:
      runEndTurn(battleState, actorId);
      return getBattleState();
    case ACTION_TYPES.PLAY_CARD:
      runPlayCard(battleState, actorId, targetId, cardId);
      return getBattleState();
    default:
      throw new Error(`Unsupported action type: ${type}`);
  }
}

module.exports = {
  getBattleConfig,
  getBattleState,
  performBattleAction,
  resetBattleState,
};
