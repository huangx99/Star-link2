const { getEnemyIntentForState } = require("../enemy-intents");
const { planEnemyTurn } = require("../enemy-ai");
const { resolveCardEffect } = require("../cards/logic");
const { PLAYER_MAX_EP_CAP, TURN_DRAW_CAP } = require("../constants");
const { runDrawCards } = require("./draw-card");
const { beginSelfTurn } = require("../turn-flow");
const { resetShield } = require("../effects/health");

function formatEnemyTurnSummary(enemy, target, plays = []) {
  if (!plays.length) {
    return `${enemy.name}没有打出手牌`;
  }

  const damage = plays.reduce((sum, play) => sum + (play.effect?.dealtDamage ?? 0), 0);
  const block = plays.reduce((sum, play) => sum + (play.effect?.block ?? 0), 0);
  const energyGain = plays.reduce((sum, play) => sum + (play.effect?.energyGain ?? 0), 0);
  const parts = [];

  if (damage > 0) {
    parts.push(`造成${damage}点伤害`);
  }

  if (block > 0) {
    parts.push(`获得${block}点护盾`);
  }

  if (energyGain > 0) {
    parts.push(`回复${energyGain}点能量`);
  }

  return `${enemy.name}打出${plays.length}张牌，${parts.join("，") || `对${target.name}施压`}`;
}

function runEndTurn(state, actorId) {
  const self = state.players.self;
  const enemy = state.players.enemy;

  if (actorId !== "self") {
    throw new Error("只有我方可以结束回合");
  }

  if (state.currentTurn !== "self") {
    throw new Error("当前不是我方回合");
  }

  state.currentTurn = "enemy";
  self.ep = 0;

  resetShield(enemy);
  enemy.maxEp = Math.min(PLAYER_MAX_EP_CAP, enemy.maxEp + 1);
  enemy.ep = enemy.maxEp;

  const enemyDrawnCards = runDrawCards(state, "enemy", state.nextTurnDrawCount, {
    suppressLastAction: true,
  });
  state.nextTurnDrawCount = Math.min(TURN_DRAW_CAP, state.nextTurnDrawCount + 1);

  const plan = planEnemyTurn(state, { simulateDraw: false });
  const plays = [];

  for (const plannedPlay of plan.plays) {
    const cardIndex = enemy.hand.findIndex((card) => card.id === plannedPlay.cardId);

    if (cardIndex < 0) {
      continue;
    }

    const [playedCard] = enemy.hand.splice(cardIndex, 1);

    enemy.handCount = enemy.hand.length;
    enemy.discardCount += 1;

    const effect = resolveCardEffect(enemy, self, playedCard);

    plays.push({
      cardId: playedCard.id,
      card: playedCard,
      effect,
    });

    if (self.hp <= 0) {
      break;
    }
  }

  const summary = formatEnemyTurnSummary(enemy, self, plays);

  if (self.hp <= 0) {
    state.winner = "enemy";
    state.currentTurn = null;
    state.enemyIntent = null;
    state.lastAction = {
      type: "enemy-turn",
      actorId: "enemy",
      targetId: "self",
      summary: `${summary}，${self.name}被击败`,
      enemyTurn: {
        draws: enemyDrawnCards.map((card) => ({
          cardId: card.id,
          card,
        })),
        plays,
      },
    };
    return state;
  }

  state.turn += 1;
  const { drawnCards: selfDrawnCards } = beginSelfTurn(state, { drawCard: true, suppressLastAction: true });
  state.lastAction = {
    type: "enemy-turn",
    actorId: "enemy",
    targetId: "self",
    summary: selfDrawnCards.length ? `${summary}，${self.name}抽了${selfDrawnCards.length}张牌` : summary,
    enemyTurn: {
      draws: enemyDrawnCards.map((card) => ({
        cardId: card.id,
        card,
      })),
      plays,
    },
    selfDraw: {
      cards: selfDrawnCards.map((card) => ({
        cardId: card.id,
        card,
      })),
    },
  };
  state.enemyIntent = getEnemyIntentForState(state);
  return state;
}

module.exports = {
  runEndTurn,
};
