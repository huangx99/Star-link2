const {
  PLAYER_DECK_SIZE,
  PLAYER_HAND_SIZE,
  PLAYER_MAX_EP,
  PLAYER_MAX_HP,
} = require("./constants");
const { createCard } = require("./cards/factory");
const { getEnemyIntentForState } = require("./enemy-intents");

function createOpeningHand(ownerId) {
  return Array.from({ length: PLAYER_HAND_SIZE }, (_, index) => createCard(ownerId, index + 1));
}

function createPlayerState({ id, name, avatar }) {
  const openingHand = createOpeningHand(id);

  return {
    id,
    name,
    avatar,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    shield: 0,
    ep: PLAYER_MAX_EP,
    maxEp: PLAYER_MAX_EP,
    deckSize: PLAYER_DECK_SIZE - PLAYER_HAND_SIZE,
    handCount: openingHand.length,
    discardCount: 0,
    nextCardNumber: openingHand.length + 1,
    hand: openingHand,
  };
}

function createBattleState() {
  const battleState = {
    turn: 1,
    currentTurn: "self",
    winner: null,
    enemyIntent: null,
    lastAction: {
      type: "turn-start",
      actorId: "self",
      targetId: "self",
      summary: "第 1 回合开始",
    },
    players: {
      enemy: createPlayerState({
        id: "enemy",
        name: "对手",
        avatar: "敌",
      }),
      self: createPlayerState({
        id: "self",
        name: "我方",
        avatar: "我",
      }),
    },
  };

  battleState.enemyIntent = getEnemyIntentForState(battleState);
  return battleState;
}

function cloneBattleState(state) {
  return structuredClone(state);
}

module.exports = {
  cloneBattleState,
  createBattleState,
};
