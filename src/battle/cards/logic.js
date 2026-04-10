const { gainEnergy, hasEnoughEnergy, spendAvailableEnergy, spendEnergy } = require("../effects/energy");
const { applyDamage, applyHeal, gainShield, spendShield } = require("../effects/health");
const { applyStatus, clearStatuses, getModifiedDamage, spendStatusStacks } = require("../effects/statuses");

function canPlayCard(player, card) {
  return Boolean(player && card && hasEnoughEnergy(player, card.cost));
}

function resolveConversionParticipant(actor, target, role) {
  return role === "target" ? target : actor;
}

function applyCardDamage(actor, damageTarget, amount, effect) {
  const finalDamage = getModifiedDamage(actor, amount);

  if (finalDamage <= 0) {
    return;
  }

  const damageResult = applyDamage(damageTarget, finalDamage);
  effect.damage += damageResult.totalDamage;
  effect.dealtDamage += damageResult.hpDamage;
  effect.blockedDamage += damageResult.blockedDamage;
}

function spendCardResource(player, resource, requestedAmount) {
  if (resource === "shield") {
    return spendShield(player, requestedAmount);
  }

  if (resource === "energy") {
    return spendAvailableEnergy(player, requestedAmount);
  }

  return 0;
}

function resolveConvertEffects(actor, target, card, effect) {
  for (const convertEffect of card.convertEffects ?? []) {
    if (!["shield", "energy"].includes(convertEffect.resource) || convertEffect.to !== "damage") {
      continue;
    }

    const sourcePlayer = resolveConversionParticipant(actor, target, convertEffect.source);
    const damageTarget = resolveConversionParticipant(actor, target, convertEffect.target);
    const availableAmount =
      convertEffect.resource === "shield"
        ? Math.max(0, Number(sourcePlayer.shield) || 0)
        : Math.max(0, Number(sourcePlayer.ep) || 0);
    const requestedAmount =
      convertEffect.mode === "all"
        ? availableAmount
        : Math.max(0, Number(convertEffect.amount) || 0);
    const spent = spendCardResource(sourcePlayer, convertEffect.resource, requestedAmount);

    if (spent <= 0) {
      continue;
    }

    const multiplier = Number(convertEffect.multiplier) || 1;
    const bonus = Math.max(0, Number(convertEffect.bonus) || 0);
    const produced = Math.max(0, Math.floor(spent * multiplier) + bonus);

    effect.resourceConversions.push({
      sourceRole: sourcePlayer.id,
      targetRole: damageTarget.id,
      resource: convertEffect.resource,
      to: "damage",
      spent,
      produced,
    });

    applyCardDamage(actor, damageTarget, produced, effect);
  }
}

function resolveStatusBurstEffects(actor, target, card, effect) {
  for (const burstEffect of card.statusBurstEffects ?? []) {
    if (burstEffect.to !== "damage") {
      continue;
    }

    const sourcePlayer = resolveConversionParticipant(actor, target, burstEffect.source);
    const damageTarget = resolveConversionParticipant(actor, target, burstEffect.target);
    const consumedStatus = spendStatusStacks(sourcePlayer, burstEffect.key, {
      mode: burstEffect.mode,
      amount: burstEffect.amount,
    });

    if (!consumedStatus || consumedStatus.spent <= 0) {
      continue;
    }

    const multiplier = Number(burstEffect.multiplier) || 1;
    const bonus = Math.max(0, Number(burstEffect.bonus) || 0);
    const produced = Math.max(0, Math.floor(consumedStatus.spent * multiplier) + bonus);

    effect.statusBursts.push({
      sourceRole: sourcePlayer.id,
      targetRole: damageTarget.id,
      key: consumedStatus.key,
      label: consumedStatus.label,
      kind: consumedStatus.kind,
      spent: consumedStatus.spent,
      produced,
      to: "damage",
    });

    applyCardDamage(actor, damageTarget, produced, effect);
  }
}

function resolveCardEffect(actor, target, card) {
  if (!actor || !target || !card) {
    throw new Error("Invalid card effect");
  }

  spendEnergy(actor, card.cost);

  const effect = {
    kind: card.kind,
    damage: 0,
    dealtDamage: 0,
    blockedDamage: 0,
    block: 0,
    heal: 0,
    energyGain: 0,
    targetRole: target.id,
    actorRole: actor.id,
    appliedStatuses: [],
    removedStatuses: [],
    resourceConversions: [],
    statusBursts: [],
  };

  resolveConvertEffects(actor, target, card, effect);
  resolveStatusBurstEffects(actor, target, card, effect);

  if (card.damage > 0) {
    applyCardDamage(actor, target, card.damage, effect);
  }

  if (card.block > 0) {
    gainShield(actor, card.block);
    effect.block = card.block;
  }

  if (card.energyGain > 0) {
    effect.energyGain = gainEnergy(actor, card.energyGain);
  }

  if (card.heal > 0) {
    const previousHp = actor.hp;
    applyHeal(actor, card.heal);
    effect.heal = Math.max(0, actor.hp - previousHp);
  }

  for (const statusEffect of card.statusEffects ?? []) {
    const targetPlayer = statusEffect.target === "target" ? target : actor;
    const appliedStatus = applyStatus(targetPlayer, statusEffect.key, {
      stacks: statusEffect.stacks,
      duration: statusEffect.duration,
      permanent: statusEffect.permanent,
    });

    effect.appliedStatuses.push({
      targetRole: targetPlayer.id,
      status: appliedStatus,
    });
  }

  for (const cleanseEffect of card.cleanseEffects ?? []) {
    const targetPlayer = cleanseEffect.target === "target" ? target : actor;
    const removedStatuses = clearStatuses(
      targetPlayer,
      {
        kind: cleanseEffect.kind,
        key: cleanseEffect.key,
      },
      {
        count: cleanseEffect.count,
        includePermanent: cleanseEffect.includePermanent,
      }
    );

    removedStatuses.forEach((status) => {
      effect.removedStatuses.push({
        targetRole: targetPlayer.id,
        status,
      });
    });
  }

  if (
    effect.damage <= 0 &&
    effect.block <= 0 &&
    effect.heal <= 0 &&
    effect.energyGain <= 0 &&
    effect.appliedStatuses.length <= 0 &&
    effect.removedStatuses.length <= 0 &&
    effect.resourceConversions.length <= 0 &&
    effect.statusBursts.length <= 0
  ) {
    throw new Error(`Unsupported card effect payload: ${card.kind}`);
  }

  return effect;
}

module.exports = {
  canPlayCard,
  resolveCardEffect,
};
