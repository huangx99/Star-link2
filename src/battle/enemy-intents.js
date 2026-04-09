const { planEnemyTurn } = require("./enemy-ai");

function getEnemyIntentForState(state) {
  return planEnemyTurn(state).intent;
}

module.exports = {
  getEnemyIntentForState,
};
