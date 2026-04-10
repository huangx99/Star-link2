const {
  PLAYER_DECK_SIZE,
  PLAYER_HAND_SIZE,
  PLAYER_MAX_EP,
  PLAYER_MAX_HP,
} = require("./constants");
const { createCard } = require("./cards/factory");
const { getDeckArchetype, getRandomDeckArchetype } = require("./cards/catalog");
const { getBossProfile, getRandomBossProfile } = require("./enemies/catalog");
const { createEnemySkill } = require("./enemies/factory");
const { getEnemyIntentForState } = require("./enemy-intents");

function createShuffledDeckOrder() {
  const deckOrder = Array.from({ length: PLAYER_DECK_SIZE }, (_, index) => index + 1);

  for (let index = deckOrder.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [deckOrder[index], deckOrder[randomIndex]] = [deckOrder[randomIndex], deckOrder[index]];
  }

  return deckOrder;
}

function createOpeningHand(ownerId, archetypeKey, deckOrder) {
  return deckOrder.slice(0, PLAYER_HAND_SIZE).map((serial) => createCard(ownerId, serial, archetypeKey));
}

function createSelfPlayerState({ id, name, avatar, archetypeKey }) {
  const deckArchetype =
    (archetypeKey ? getDeckArchetype(id, archetypeKey) : null) ||
    getRandomDeckArchetype(id);
  const deckOrder = createShuffledDeckOrder();
  const openingHand = createOpeningHand(id, deckArchetype.key, deckOrder);

  return {
    id,
    name,
    avatar,
    statuses: [],
    deckArchetype: {
      key: deckArchetype.key,
      label: deckArchetype.label,
      description: deckArchetype.description,
    },
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    shield: 0,
    ep: PLAYER_MAX_EP,
    maxEp: PLAYER_MAX_EP,
    deckSize: PLAYER_DECK_SIZE - PLAYER_HAND_SIZE,
    handCount: openingHand.length,
    discardCount: 0,
    deckOrder,
    nextDeckIndex: openingHand.length,
    hand: openingHand,
  };
}

function createEnemyBossState({ id, name, avatar, bossKey }) {
  const bossProfile =
    (bossKey ? getBossProfile(bossKey) : null) ||
    getRandomBossProfile();
  const skills = bossProfile.skills.map((skillTemplate) => createEnemySkill(id, skillTemplate));
  const skillCooldowns = Object.fromEntries(skills.map((skill) => [skill.key, 0]));

  return {
    id,
    name,
    avatar: bossProfile.avatar || avatar,
    controller: "boss",
    statuses: [],
    deckArchetype: {
      key: bossProfile.key,
      label: bossProfile.label,
      description: bossProfile.description,
    },
    hp: bossProfile.maxHp ?? PLAYER_MAX_HP,
    maxHp: bossProfile.maxHp ?? PLAYER_MAX_HP,
    shield: 0,
    ep: bossProfile.baseEp ?? PLAYER_MAX_EP,
    maxEp: bossProfile.baseEp ?? PLAYER_MAX_EP,
    deckSize: 0,
    handCount: 0,
    discardCount: 0,
    deckOrder: [],
    nextDeckIndex: 0,
    hand: [],
    skills,
    skillCooldowns,
  };
}

function createBattleState(options = {}) {
  const selfArchetypeKey = options.selfArchetypeKey || null;
  const enemyArchetypeKey = options.enemyArchetypeKey || null;
  const battleState = {
    turn: 1,
    currentTurn: "self",
    nextTurnDrawCount: 1,
    winner: null,
    enemyIntent: null,
    lastAction: {
      type: "turn-start",
      actorId: "self",
      targetId: "self",
      summary: "",
    },
    players: {
      enemy: createEnemyBossState({
        id: "enemy",
        name: "对手",
        avatar: "敌",
        bossKey: enemyArchetypeKey,
      }),
      self: createSelfPlayerState({
        id: "self",
        name: "我方",
        avatar: "我",
        archetypeKey: selfArchetypeKey,
      }),
    },
  };

  battleState.lastAction.summary =
    `第 1 回合开始，我方为${battleState.players.self.deckArchetype.label}，` +
    `对手为${battleState.players.enemy.deckArchetype.label}`;

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
