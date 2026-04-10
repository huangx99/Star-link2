const { applyDamage, applyHeal } = require("./health");

const STATUS_DEFINITIONS = {
  sharpness: {
    key: "sharpness",
    label: "锐势",
    kind: "buff",
    icon: "ATK",
    description: "造成伤害时，每层额外增加1点伤害。",
    permanent: true,
  },
  weaken: {
    key: "weaken",
    label: "虚弱",
    kind: "debuff",
    icon: "WEK",
    description: "造成伤害时，每层减少1点伤害，回合结束后持续回合数减少。",
    defaultDuration: 2,
    expireTiming: "turn-end",
  },
  poison: {
    key: "poison",
    label: "中毒",
    kind: "debuff",
    icon: "PSN",
    description: "回合结束时受到等同层数的伤害，然后层数减1。",
    triggerTiming: "turn-end",
    stackDecayOnTrigger: 1,
  },
  regen: {
    key: "regen",
    label: "再生",
    kind: "buff",
    icon: "REG",
    description: "回合结束时回复等同层数的生命，然后层数减1。",
    triggerTiming: "turn-end",
    stackDecayOnTrigger: 1,
  },
};

function getStatusDefinition(statusKey) {
  const definition = STATUS_DEFINITIONS[statusKey];

  if (!definition) {
    throw new Error(`Unsupported status: ${statusKey}`);
  }

  return definition;
}

function ensureStatusList(player) {
  if (!Array.isArray(player.statuses)) {
    player.statuses = [];
  }

  return player.statuses;
}

function sortStatuses(player) {
  const statuses = ensureStatusList(player);
  statuses.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "buff" ? -1 : 1;
    }

    if (Boolean(left.permanent) !== Boolean(right.permanent)) {
      return left.permanent ? -1 : 1;
    }

    return left.label.localeCompare(right.label, "zh-CN");
  });

  return statuses;
}

function buildStatusState(statusKey, options = {}) {
  const definition = getStatusDefinition(statusKey);
  const permanent = options.permanent === true || definition.permanent === true;
  const baseStacks = Math.max(1, Number(options.stacks) || 1);
  const duration =
    permanent
      ? null
      : options.duration ?? definition.defaultDuration ?? null;

  return {
    key: definition.key,
    label: definition.label,
    kind: definition.kind,
    icon: definition.icon,
    description: definition.description,
    permanent,
    stacks: baseStacks,
    duration: duration == null ? null : Math.max(1, Number(duration) || 1),
  };
}

function getStatus(player, statusKey) {
  return ensureStatusList(player).find((status) => status.key === statusKey) || null;
}

function getStatusStacks(player, statusKey) {
  return getStatus(player, statusKey)?.stacks ?? 0;
}

function applyStatus(player, statusKey, options = {}) {
  const definition = getStatusDefinition(statusKey);
  const statuses = ensureStatusList(player);
  const nextStatus = buildStatusState(statusKey, options);
  const existingStatus = statuses.find((status) => status.key === statusKey);

  if (!existingStatus) {
    statuses.push(nextStatus);
    sortStatuses(player);
    return structuredClone(nextStatus);
  }

  existingStatus.stacks += nextStatus.stacks;

  if (nextStatus.permanent) {
    existingStatus.permanent = true;
    existingStatus.duration = null;
  } else if (!existingStatus.permanent && nextStatus.duration != null) {
    existingStatus.duration = Math.max(existingStatus.duration ?? 0, nextStatus.duration);
  }

  existingStatus.label = definition.label;
  existingStatus.kind = definition.kind;
  existingStatus.icon = definition.icon;
  existingStatus.description = definition.description;
  sortStatuses(player);
  return structuredClone(existingStatus);
}

function removeStatusByKey(player, statusKey) {
  const statuses = ensureStatusList(player);
  const index = statuses.findIndex((status) => status.key === statusKey);

  if (index < 0) {
    return null;
  }

  const [removed] = statuses.splice(index, 1);
  return removed || null;
}

function clearStatuses(player, filter = {}, options = {}) {
  const statuses = ensureStatusList(player);
  const includePermanent = options.includePermanent === true;
  const limit = Math.max(0, Number(options.count ?? Number.POSITIVE_INFINITY) || 0);
  const removedStatuses = [];
  const nextStatuses = [];

  for (const status of statuses) {
    const kindMatches = !filter.kind || status.kind === filter.kind;
    const keyMatches = !filter.key || status.key === filter.key;
    const permanentMatches = includePermanent || !status.permanent;
    const shouldRemove =
      removedStatuses.length < limit &&
      kindMatches &&
      keyMatches &&
      permanentMatches;

    if (shouldRemove) {
      removedStatuses.push(status);
      continue;
    }

    nextStatuses.push(status);
  }

  player.statuses = nextStatuses;
  return removedStatuses.map((status) => structuredClone(status));
}

function spendStatusStacks(player, statusKey, options = {}) {
  const status = getStatus(player, statusKey);

  if (!status) {
    return null;
  }

  const requestedAmount =
    options.mode === "all"
      ? status.stacks
      : Math.max(0, Number(options.amount) || 0);
  const spent = Math.min(status.stacks, requestedAmount);

  if (spent <= 0) {
    return null;
  }

  status.stacks -= spent;
  const consumedStatus = {
    key: status.key,
    label: status.label,
    kind: status.kind,
    icon: status.icon,
    description: status.description,
    spent,
  };

  if (status.stacks <= 0) {
    removeStatusByKey(player, statusKey);
  } else {
    sortStatuses(player);
  }

  return consumedStatus;
}

function getModifiedDamage(player, baseDamage) {
  const safeDamage = Math.max(0, Number(baseDamage) || 0);
  const sharpness = getStatusStacks(player, "sharpness");
  const weaken = getStatusStacks(player, "weaken");
  return Math.max(0, safeDamage + sharpness - weaken);
}

function processStatusPhase(player, phase) {
  const summaries = [];
  const statuses = ensureStatusList(player);
  const nextStatuses = [];

  for (const currentStatus of statuses) {
    const status = structuredClone(currentStatus);
    const definition = getStatusDefinition(status.key);

    if (definition.triggerTiming === phase) {
      if (status.key === "poison") {
        const damageResult = applyDamage(player, status.stacks);

        if (damageResult.totalDamage > 0) {
          summaries.push(`${status.label}${status.stacks}触发，受到${damageResult.totalDamage}点伤害`);
        }
      }

      if (status.key === "regen") {
        const previousHp = player.hp;
        applyHeal(player, status.stacks);
        const healed = Math.max(0, player.hp - previousHp);

        if (healed > 0) {
          summaries.push(`${status.label}${status.stacks}触发，回复${healed}点生命`);
        }
      }

      if (definition.stackDecayOnTrigger) {
        status.stacks = Math.max(0, status.stacks - definition.stackDecayOnTrigger);
      }
    }

    if (definition.expireTiming === phase && !status.permanent && status.duration != null) {
      status.duration = Math.max(0, status.duration - 1);
    }

    if (status.stacks <= 0) {
      continue;
    }

    if (!status.permanent && status.duration != null && status.duration <= 0) {
      continue;
    }

    nextStatuses.push(status);
  }

  player.statuses = nextStatuses;
  sortStatuses(player);

  return {
    summaries,
    statuses: player.statuses.map((status) => structuredClone(status)),
  };
}

module.exports = {
  applyStatus,
  clearStatuses,
  getModifiedDamage,
  getStatus,
  getStatusDefinition,
  getStatusStacks,
  processStatusPhase,
  removeStatusByKey,
  spendStatusStacks,
  sortStatuses,
};
