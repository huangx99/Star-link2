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

function spendAvailableEnergy(player, amount) {
  const currentEnergy = Math.max(0, Number(player.ep) || 0);
  const spent = Math.min(currentEnergy, Math.max(0, Number(amount) || 0));
  player.ep = currentEnergy - spent;
  clampEnergy(player);
  return spent;
}

function hasEnoughEnergy(player, amount) {
  return player.ep >= amount;
}

module.exports = {
  clampEnergy,
  gainEnergy,
  hasEnoughEnergy,
  spendAvailableEnergy,
  spendEnergy,
};
