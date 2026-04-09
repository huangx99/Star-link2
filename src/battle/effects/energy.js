function clampEnergy(player) {
  player.ep = Math.max(0, Math.min(player.maxEp, player.ep));
  return player;
}

function spendEnergy(player, amount) {
  player.ep -= Math.max(0, amount);
  return clampEnergy(player);
}

function gainEnergy(player, amount) {
  player.ep += Math.max(0, amount);
  return clampEnergy(player);
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
