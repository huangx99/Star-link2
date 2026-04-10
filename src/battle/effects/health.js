function clampHp(player) {
  player.hp = Math.max(0, Math.min(player.maxHp, player.hp));
  return player;
}

function clampShield(player) {
  player.shield = Math.max(0, Number(player.shield) || 0);
  return player;
}

function applyDamage(player, amount) {
  const totalDamage = Math.max(0, amount);
  const shield = Math.max(0, Number(player.shield) || 0);
  const blockedDamage = Math.min(shield, totalDamage);
  const hpDamage = totalDamage - blockedDamage;

  player.shield = shield - blockedDamage;
  player.hp -= hpDamage;
  clampShield(player);
  clampHp(player);

  return {
    totalDamage,
    blockedDamage,
    hpDamage,
  };
}

function applyHeal(player, amount) {
  player.hp += Math.max(0, amount);
  return clampHp(player);
}

function gainShield(player, amount) {
  player.shield = Math.max(0, Number(player.shield) || 0) + Math.max(0, amount);
  return clampShield(player);
}

function spendShield(player, amount) {
  const shield = Math.max(0, Number(player.shield) || 0);
  const spent = Math.min(shield, Math.max(0, Number(amount) || 0));
  player.shield = shield - spent;
  clampShield(player);
  return spent;
}

function resetShield(player) {
  player.shield = 0;
  return clampShield(player);
}

module.exports = {
  applyDamage,
  applyHeal,
  clampHp,
  clampShield,
  gainShield,
  spendShield,
  resetShield,
};
