const { PLAYER_MAX_EP_CAP } = require("../constants");

function clampEnergy(player) {
  player.ep = Math.max(0, Math.min(PLAYER_MAX_EP_CAP, Number(player.ep) || 0));
  return player;
}

function spendEnergy(player, amount) {
  player.ep -= Math.max(0, amount);
  return clampEnergy(player);
}

function gainEnergy(player, amount) {
  const beforeEnergy = Math.max(0, Math.min(PLAYER_MAX_EP_CAP, Number(player.ep) || 0));
  player.ep += Math.max(0, amount);
  clampEnergy(player);
  return player.ep - beforeEnergy;
}

function hasEnoughEnergy(player, amount) {
  return player.ep >= amount;
}

module.exports = {
  clampEnergy,
  gainEnergy,
  hasEnoughEnergy,
  spendEnergy,
};
