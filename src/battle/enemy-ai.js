const { gainEnergy, spendAvailableEnergy } = require("./effects/energy");
const { spendShield } = require("./effects/health");
const { applyStatus, clearStatuses, getModifiedDamage, spendStatusStacks } = require("./effects/statuses");

function cloneCooldowns(enemy) {
  return {
    ...(enemy?.skillCooldowns || {}),
  };
}

function reduceSkillCooldowns(enemy) {
  const nextCooldowns = cloneCooldowns(enemy);

  Object.keys(nextCooldowns).forEach((skillKey) => {
    nextCooldowns[skillKey] = Math.max(0, (Number(nextCooldowns[skillKey]) || 0) - 1);
  });

  enemy.skillCooldowns = nextCooldowns;
  return nextCooldowns;
}

function prepareEnemyBossTurn(enemy) {
  enemy.shield = 0;
  enemy.ep = enemy.maxEp;
  reduceSkillCooldowns(enemy);
  return enemy;
}

function createSimState(actor, target) {
  return {
    actor: structuredClone(actor),
    target: structuredClone(target),
    totalDamage: 0,
    totalBlock: 0,
    totalEnergyGain: 0,
    totalHeal: 0,
    totalStatusPressure: 0,
    usedSkillKeys: [],
    plays: [],
  };
}

function getIncomingThreatEstimate(player, target) {
  const attackCards = (player?.hand ?? []).filter(
    (card) => (card.damage ?? 0) > 0 || (card.convertEffects?.length ?? 0) > 0 || (card.statusBurstEffects?.length ?? 0) > 0
  );
  const affordableCount = Math.min(Math.max(1, (player?.maxEp ?? 1) + 1), attackCards.length);

  return attackCards
    .sort(
      (left, right) =>
        estimatePayloadDamage(player, target, right) - estimatePayloadDamage(player, target, left)
    )
    .slice(0, affordableCount)
    .reduce((sum, card) => sum + estimatePayloadDamage(player, target, card), 0);
}

function resolveConversionParticipant(actor, target, role) {
  return role === "target" ? target : actor;
}

function estimatePayloadDamage(actor, target, payload) {
  let totalDamage = Math.max(0, Number(payload.damage) || 0);

  (payload.convertEffects ?? []).forEach((convertEffect) => {
    if (!["shield", "energy"].includes(convertEffect.resource) || convertEffect.to !== "damage") {
      return;
    }

    const sourcePlayer = convertEffect.source === "target" ? target : actor;

    if (!sourcePlayer) {
      return;
    }

    const availableAmount =
      convertEffect.resource === "shield"
        ? Math.max(0, Number(sourcePlayer.shield) || 0)
        : Math.max(0, Number(sourcePlayer.ep) || 0);
    const requestedAmount =
      convertEffect.mode === "all"
        ? availableAmount
        : Math.max(0, Number(convertEffect.amount) || 0);
    const spent = Math.min(availableAmount, requestedAmount);
    const multiplier = Number(convertEffect.multiplier) || 1;
    const bonus = Math.max(0, Number(convertEffect.bonus) || 0);
    totalDamage += Math.max(0, Math.floor(spent * multiplier) + bonus);
  });

  (payload.statusBurstEffects ?? []).forEach((burstEffect) => {
    if (burstEffect.to !== "damage") {
      return;
    }

    const sourcePlayer = burstEffect.source === "target" ? target : actor;

    if (!sourcePlayer) {
      return;
    }

    const availableStacks =
      sourcePlayer.statuses?.find((status) => status.key === burstEffect.key)?.stacks ?? 0;
    const requestedAmount =
      burstEffect.mode === "all"
        ? availableStacks
        : Math.max(0, Number(burstEffect.amount) || 0);
    const spent = Math.min(availableStacks, requestedAmount);
    const multiplier = Number(burstEffect.multiplier) || 1;
    const bonus = Math.max(0, Number(burstEffect.bonus) || 0);
    totalDamage += Math.max(0, Math.floor(spent * multiplier) + bonus);
  });

  return getModifiedDamage(actor, totalDamage);
}

function applySimulatedDamage(actor, damageTarget, amount, play, nextState) {
  const rawDamage = getModifiedDamage(actor, amount);

  if (rawDamage <= 0) {
    return;
  }

  const blockedDamage = Math.min(damageTarget.shield || 0, rawDamage);
  const hpDamage = rawDamage - blockedDamage;

  damageTarget.shield = Math.max(0, (damageTarget.shield || 0) - blockedDamage);
  damageTarget.hp = Math.max(0, damageTarget.hp - hpDamage);
  play.damage += rawDamage;

  if (damageTarget.id === nextState.target.id) {
    nextState.totalDamage += hpDamage;
  }
}

function applySimulatedSkill(simState, skill) {
  const nextState = structuredClone(simState);
  const actor = nextState.actor;
  const target = nextState.target;
  const cooldown = Number(actor.skillCooldowns?.[skill.key]) || 0;

  if (nextState.usedSkillKeys.includes(skill.key) || cooldown > 0 || actor.ep < skill.cost) {
    return null;
  }

  actor.ep -= skill.cost;
  nextState.usedSkillKeys.push(skill.key);

  if (!actor.skillCooldowns) {
    actor.skillCooldowns = {};
  }

  actor.skillCooldowns[skill.key] = Math.max(0, Number(skill.cooldown) || 0);

  const play = {
    cardId: skill.id,
    card: skill,
    kind: skill.kind,
    damage: 0,
    block: 0,
    heal: 0,
    energyGain: 0,
    appliedStatuses: [],
    removedStatuses: [],
    resourceConversions: [],
    statusBursts: [],
  };

  for (const convertEffect of skill.convertEffects ?? []) {
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
    const spent =
      convertEffect.resource === "shield"
        ? spendShield(sourcePlayer, requestedAmount)
        : spendAvailableEnergy(sourcePlayer, requestedAmount);

    if (spent <= 0) {
      continue;
    }

    const multiplier = Number(convertEffect.multiplier) || 1;
    const bonus = Math.max(0, Number(convertEffect.bonus) || 0);
    const produced = Math.max(0, Math.floor(spent * multiplier) + bonus);

    play.resourceConversions.push({
      sourceRole: sourcePlayer.id,
      targetRole: damageTarget.id,
      resource: convertEffect.resource,
      to: "damage",
      spent,
      produced,
    });

    applySimulatedDamage(actor, damageTarget, produced, play, nextState);
  }

  for (const burstEffect of skill.statusBurstEffects ?? []) {
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

    play.statusBursts.push({
      sourceRole: sourcePlayer.id,
      targetRole: damageTarget.id,
      key: consumedStatus.key,
      label: consumedStatus.label,
      kind: consumedStatus.kind,
      spent: consumedStatus.spent,
      produced,
      to: "damage",
    });

    if (damageTarget.id === target.id) {
      nextState.totalStatusPressure += produced;
    }

    applySimulatedDamage(actor, damageTarget, produced, play, nextState);
  }

  if ((skill.damage ?? 0) > 0) {
    applySimulatedDamage(actor, target, skill.damage ?? 0, play, nextState);
  }

  if ((skill.block ?? 0) > 0) {
    actor.shield = Math.max(0, actor.shield || 0) + Math.max(0, skill.block ?? 0);
    play.block = Math.max(0, skill.block ?? 0);
    nextState.totalBlock += play.block;
  }

  if ((skill.energyGain ?? 0) > 0) {
    play.energyGain = gainEnergy(actor, skill.energyGain ?? 0);
    nextState.totalEnergyGain += play.energyGain;
  }

  if ((skill.heal ?? 0) > 0) {
    const previousHp = actor.hp;
    actor.hp = Math.min(actor.maxHp, actor.hp + Math.max(0, skill.heal ?? 0));
    play.heal = Math.max(0, actor.hp - previousHp);
    nextState.totalHeal += play.heal;
  }

  for (const statusEffect of skill.statusEffects ?? []) {
    const statusTarget = statusEffect.target === "target" ? target : actor;
    const appliedStatus = applyStatus(statusTarget, statusEffect.key, {
      stacks: statusEffect.stacks,
      duration: statusEffect.duration,
      permanent: statusEffect.permanent,
    });

    play.appliedStatuses.push({
      targetRole: statusTarget.id,
      status: appliedStatus,
    });

    if (statusTarget.id === target.id) {
      if (statusEffect.key === "poison") {
        nextState.totalStatusPressure += (statusEffect.stacks ?? 1) * 7;
      } else if (statusEffect.key === "weaken") {
        nextState.totalStatusPressure += (statusEffect.stacks ?? 1) * 5;
      }
    } else if (statusTarget.id === actor.id) {
      if (statusEffect.key === "sharpness") {
        nextState.totalStatusPressure += (statusEffect.stacks ?? 1) * 6;
      } else if (statusEffect.key === "regen") {
        nextState.totalStatusPressure += (statusEffect.stacks ?? 1) * 5;
      }
    }
  }

  for (const cleanseEffect of skill.cleanseEffects ?? []) {
    const cleanseTarget = cleanseEffect.target === "target" ? target : actor;
    const removedStatuses = clearStatuses(
      cleanseTarget,
      {
        kind: cleanseEffect.kind,
        key: cleanseEffect.key,
      },
      {
        count: cleanseEffect.count,
        includePermanent: cleanseEffect.includePermanent,
      }
    );

    if (removedStatuses.length) {
      removedStatuses.forEach((status) => {
        play.removedStatuses.push({
          targetRole: cleanseTarget.id,
          status,
        });
      });

      nextState.totalStatusPressure += removedStatuses.length * 4;
    }
  }

  if (
    play.damage <= 0 &&
    play.block <= 0 &&
    play.energyGain <= 0 &&
    (play.heal ?? 0) <= 0 &&
    (play.appliedStatuses?.length ?? 0) <= 0 &&
    (play.removedStatuses?.length ?? 0) <= 0 &&
    (play.resourceConversions?.length ?? 0) <= 0 &&
    (play.statusBursts?.length ?? 0) <= 0
  ) {
    return null;
  }

  nextState.plays.push(play);
  return nextState;
}

function scoreSimState(simState, context) {
  const { incomingThreat, targetMaxHp } = context;
  const lethalBonus = simState.target.hp <= 0 ? 10000 : 0;
  const effectiveShield = Math.min(simState.actor.shield || 0, incomingThreat);
  const lowHpFactor = simState.actor.hp <= Math.max(10, incomingThreat) ? 1.7 : 1;
  const pressureFactor = simState.target.hp <= Math.ceil(targetMaxHp * 0.4) ? 1.35 : 1;

  return (
    lethalBonus +
    simState.totalDamage * 26 * pressureFactor +
    effectiveShield * 14 * lowHpFactor +
    simState.totalBlock * 2 +
    simState.totalHeal * 12 +
    simState.totalEnergyGain * 8 +
    simState.totalStatusPressure +
    simState.plays.length * 6 -
    simState.actor.ep * 18
  );
}

function searchBestSequence(simState, context) {
  const playableSkills = (simState.actor.skills ?? []).filter((skill) => {
    const cooldown = Number(simState.actor.skillCooldowns?.[skill.key]) || 0;
    return cooldown <= 0 && !simState.usedSkillKeys.includes(skill.key) && simState.actor.ep >= skill.cost;
  });

  if (!playableSkills.length) {
    return simState;
  }

  let bestState = simState;
  let bestScore = scoreSimState(simState, context);

  playableSkills.forEach((skill) => {
    const nextState = applySimulatedSkill(simState, skill);

    if (!nextState) {
      return;
    }

    const candidate = searchBestSequence(nextState, context);
    const candidateScore = scoreSimState(candidate, context);

    if (candidateScore > bestScore) {
      bestScore = candidateScore;
      bestState = candidate;
    }
  });

  return bestState;
}

function formatIntent(plan) {
  if (!plan.plays.length) {
    return {
      key: "idle",
      label: "蓄势",
      preview: "准备咆哮观望",
    };
  }

  const damage = plan.plays.reduce((sum, play) => sum + play.damage, 0);
  const block = plan.plays.reduce((sum, play) => sum + play.block, 0);
  const energyGain = plan.plays.reduce((sum, play) => sum + play.energyGain, 0);
  const previewParts = [];

  if (damage > 0) {
    previewParts.push(`预计伤害 ${damage}`);
  }

  if (block > 0) {
    previewParts.push(`预计护盾 ${block}`);
  }

  if (energyGain > 0) {
    previewParts.push(`预计回能 ${energyGain}`);
  }

  return {
    key: plan.plays.map((play) => play.kind).join("-"),
    label: plan.plays.map((play) => play.card.name).join(" / "),
    preview: previewParts.join(" · "),
  };
}

function planEnemyTurn(state, options = {}) {
  const enemyTurnStateReady = options.enemyTurnStateReady === true;
  const enemy = structuredClone(state.players.enemy);
  const self = structuredClone(state.players.self);

  if (enemy.controller !== "boss") {
    return {
      draws: [],
      plays: [],
      intent: {
        key: "idle",
        label: "待机",
        preview: "暂无动作",
      },
    };
  }

  if (!enemyTurnStateReady) {
    prepareEnemyBossTurn(enemy);
  }

  const context = {
    incomingThreat: getIncomingThreatEstimate(self, enemy),
    targetMaxHp: self.maxHp,
  };
  const bestState = searchBestSequence(createSimState(enemy, self), context);

  return {
    draws: [],
    plays: bestState.plays,
    intent: formatIntent(bestState),
  };
}

module.exports = {
  planEnemyTurn,
  prepareEnemyBossTurn,
};
