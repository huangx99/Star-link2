const battleStatus = document.querySelector("[data-battle-status]");
const turnIndicator = document.querySelector("[data-turn-indicator]");
const actionButtons = document.querySelectorAll("[data-action]");
const enemyIntentNode = document.querySelector("[data-player-intent]");
const selfHandRoot = document.querySelector('[data-hand="self"]');
const gameScreen = document.querySelector(".game-screen");
const fxCanvas = document.querySelector("[data-fx-layer]");
const cardDetailPanel = document.querySelector("[data-card-detail]");
const selfArchetypeSelect = document.querySelector('[data-archetype-select="self"]');
const enemyArchetypeSelect = document.querySelector('[data-archetype-select="enemy"]');
const CARD_WIDTH = 84;
const CARD_HEIGHT = 124;
const HAND_MAX_SPAN = 356;
let dragState = null;
let currentBattleState = null;
let isResolvingAction = false;
let activeSelfCardId = null;
let lastSelectedSelfCard = null;
let activeStatusTooltip = null;
let battleConfig = null;

const STATUS_DETAIL_THEME = {
  sharpness: {
    label: "锐势",
    kind: "buff",
    color: "#d2b04a",
    description: "造成伤害时，每层额外增加1点伤害。",
  },
  weaken: {
    label: "虚弱",
    kind: "debuff",
    color: "#d86a94",
    description: "造成伤害时，每层减少1点伤害，持续回合会在回合结束时衰减。",
  },
  poison: {
    label: "中毒",
    kind: "debuff",
    color: "#ff7ca8",
    description: "回合结束时受到等同层数的伤害，然后层数减1。",
  },
  regen: {
    label: "再生",
    kind: "buff",
    color: "#7edc8f",
    description: "回合结束时回复等同层数的生命，然后层数减1。",
  },
  cleanse: {
    label: "净化",
    kind: "cleanse",
    color: "#72dacc",
    description: "清除目标身上的负面状态。",
  },
};

function setBattleStatus(message, type = "info") {
  if (!battleStatus) {
    return;
  }

  battleStatus.textContent = message;
  battleStatus.dataset.statusType = type;
}

function populateArchetypeSelect(selectNode, archetypes = []) {
  if (!selectNode) {
    return;
  }

  const options = [
    '<option value="">随机</option>',
    ...archetypes.map(
      (archetype) =>
        `<option value="${escapeHtml(archetype.key)}">${escapeHtml(archetype.label)}</option>`
    ),
  ];

  selectNode.innerHTML = options.join("");
}

function setArchetypeSelectsDisabled(disabled) {
  if (selfArchetypeSelect) {
    selfArchetypeSelect.disabled = disabled;
  }

  if (enemyArchetypeSelect) {
    enemyArchetypeSelect.disabled = disabled;
  }
}

function getCardDescription(card) {
  if (card?.description) {
    return card.description;
  }

  switch (card?.kind) {
    case "attack":
      return `对敌方造成${card.damage ?? 0}点伤害`;
    case "defend":
      return `获得${card.block ?? 0}点护盾`;
    case "energize":
      return `回复${card.energyGain ?? 0}点能量`;
    default:
      return "发动一项战术效果";
  }
}

function getStatusTheme(statusKey, fallback = {}) {
  return {
    label: fallback.label || STATUS_DETAIL_THEME[statusKey]?.label || statusKey,
    kind: fallback.kind || STATUS_DETAIL_THEME[statusKey]?.kind || "buff",
    color: STATUS_DETAIL_THEME[statusKey]?.color || (fallback.kind === "debuff" ? "#d86a94" : "#8bbf58"),
    description: fallback.description || STATUS_DETAIL_THEME[statusKey]?.description || "状态效果说明待补充。",
  };
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatStatusChipMeta(status) {
  if (!status) {
    return "";
  }

  const stackText = status.stacks > 0 ? `x${status.stacks}` : "";
  const durationText = status.permanent ? "∞" : status.duration != null ? `${status.duration}T` : "";
  return [stackText, durationText].filter(Boolean).join(" ");
}

function createStatusChipMarkup(status, role) {
  const chipClass = ["status-chip", status.kind];

  if (status.permanent) {
    chipClass.push("is-permanent");
  }

  return `
    <button
      class="${chipClass.join(" ")}"
      type="button"
      data-status-chip
      data-status-role="${role}"
      data-status-key="${status.key}"
      title="${status.description || status.label}"
    >
      <span class="status-chip-label">${status.label}</span>
      <span class="status-chip-meta">${formatStatusChipMeta(status)}</span>
    </button>
  `;
}

function renderStatusStrip(container, role, statuses = []) {
  if (!container) {
    return;
  }

  container.innerHTML = statuses.map((status) => createStatusChipMarkup(status, role)).join("");
}

function buildCardStatusDetailEntries(card) {
  const entries = [];

  (card?.statusEffects ?? []).forEach((statusEffect) => {
    const theme = getStatusTheme(statusEffect.key);
    const targetText = statusEffect.target === "target" ? "目标" : "自身";
    const stackText = Math.max(1, Number(statusEffect.stacks) || 1);
    const durationText = statusEffect.permanent ? "永久" : statusEffect.duration ? `，持续${statusEffect.duration}回合` : "";

    entries.push({
      color: theme.color,
      label: `[${theme.label}]`,
      text: `${targetText}获得${stackText}层${durationText}。${theme.description}`,
    });
  });

  (card?.cleanseEffects ?? []).forEach((cleanseEffect) => {
    const theme = getStatusTheme("cleanse", { kind: "cleanse" });
    const targetText = cleanseEffect.target === "target" ? "目标" : "自身";
    const countText =
      Number.isFinite(cleanseEffect.count) && cleanseEffect.count < 99
        ? `${cleanseEffect.count}个`
        : "所有";
    const kindText = cleanseEffect.kind === "buff" ? "增益" : cleanseEffect.kind === "debuff" ? "减益" : "状态";

    entries.push({
      color: theme.color,
      label: `[${theme.label}]`,
      text: `${targetText}清除${countText}${kindText}状态。`,
    });
  });

  (card?.statusBurstEffects ?? []).forEach((burstEffect) => {
    const theme = getStatusTheme(burstEffect.key);
    const sourceText = burstEffect.source === "target" ? "目标" : "自身";
    const targetText = burstEffect.target === "target" ? "目标" : "自身";
    const countText =
      burstEffect.mode === "all"
        ? "全部"
        : `${Math.max(1, Number(burstEffect.amount) || 1)}层`;
    const multiplier = Number(burstEffect.multiplier) || 1;
    const bonus = Math.max(0, Number(burstEffect.bonus) || 0);
    const producedText =
      bonus > 0
        ? `每层转为${multiplier}点伤害并额外增加${bonus}点`
        : `每层转为${multiplier}点伤害`;

    entries.push({
      color: theme.color,
      label: `[${theme.label}]`,
      text: `引爆${sourceText}${countText}层，对${targetText}${producedText}。`,
    });
  });

  return entries;
}

function renderDetailStatusSection(title, entries = []) {
  if (!entries.length) {
    return "";
  }

  return `
    <div class="card-detail-status-list">
      <p class="card-detail-status-title">${title}</p>
      ${entries
        .map(
          (entry) => `
            <div class="card-detail-status-item">
              <span class="card-detail-status-dot" aria-hidden="true" style="color:${entry.color};"></span>
              <span><strong>${escapeHtml(entry.label || "")}</strong>${entry.label ? " " : ""}${escapeHtml(entry.text)}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function getStatusByRoleAndKey(role, statusKey) {
  const player = currentBattleState?.players?.[role];

  if (!player) {
    return null;
  }

  return player.statuses?.find((status) => status.key === statusKey) || null;
}

function hideStatusTooltip() {
  if (!activeStatusTooltip) {
    return;
  }

  activeStatusTooltip.node.remove();
  activeStatusTooltip = null;
}

function showStatusTooltip(statusChip) {
  if (!gameScreen || !statusChip) {
    return;
  }

  const role = statusChip.dataset.statusRole;
  const statusKey = statusChip.dataset.statusKey;
  const status = getStatusByRoleAndKey(role, statusKey);

  if (!status) {
    hideStatusTooltip();
    return;
  }

  hideStatusTooltip();

  const theme = getStatusTheme(status.key, status);
  const tooltip = document.createElement("div");
  const chipRect = statusChip.getBoundingClientRect();
  const gameRect = gameScreen.getBoundingClientRect();
  const stackText = status.stacks > 0 ? `${status.stacks}层` : "";
  const durationText = status.permanent ? "永久" : status.duration != null ? `${status.duration}回合` : "";
  const metaText = [stackText, durationText].filter(Boolean).join(" · ");

  tooltip.className = "status-tooltip";
  tooltip.innerHTML = `
    <p class="status-tooltip-name">[${escapeHtml(theme.label)}]</p>
    ${metaText ? `<p class="status-tooltip-meta">${escapeHtml(metaText)}</p>` : ""}
    <p class="status-tooltip-desc">${escapeHtml(theme.description)}</p>
  `;

  gameScreen.appendChild(tooltip);

  const tooltipRect = tooltip.getBoundingClientRect();
  let left = chipRect.left - gameRect.left + chipRect.width / 2 - tooltipRect.width / 2;
  let top = chipRect.top - gameRect.top - tooltipRect.height - 8;

  left = Math.max(6, Math.min(left, gameRect.width - tooltipRect.width - 6));

  if (top < 6) {
    top = chipRect.bottom - gameRect.top + 8;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.setProperty("--status-tooltip-accent", theme.color);
  activeStatusTooltip = {
    node: tooltip,
    role,
    key: statusKey,
  };
}

function getHandLayout(count, index, role) {
  const centerIndex = (count - 1) / 2;
  const maxDistance = Math.max(1, centerIndex);
  const normalized = centerIndex === 0 ? 0 : (index - centerIndex) / maxDistance;
  const roleDirection = role === "self" ? 1 : -1;

  return {
    angle: normalized * 14 * roleDirection,
    offsetY: Math.pow(Math.abs(normalized), 1.35) * 16 * roleDirection,
    zIndex: index + 1,
  };
}

function createHandCardMarkup(card, role, layout) {
  const style = `--card-angle:${layout.angle}deg;--card-offset-y:${layout.offsetY}px;--card-z-index:${layout.zIndex};`;

  if (role === "enemy") {
    return `
      <article class="hand-card is-hidden" data-card-id="${card.id}" style="${style}" aria-label="对手手牌背面">
        <div class="card-back-pattern">
          <div class="card-back-core">
            <span class="card-back-title">STAR</span>
            <span class="card-back-subtitle">LINK</span>
          </div>
        </div>
      </article>
    `;
  }

  const accent = card.accent || card.kind || "neutral";
  const description = getCardDescription(card);
  const artClass = card.art ? "has-art" : "is-placeholder";
  const artStyle = card.art ? ` style="--card-image:url('${card.art}');"` : "";

  return `
    <article
      class="hand-card"
      data-card-id="${card.id}"
      data-card-kind="${accent}"
      style="${style}"
      aria-label="${card.name}，消耗${card.cost}点能量，效果：${description}"
    >
      <div class="card-hero">
        <div class="card-name-row">
          <p class="card-name">${card.name}</p>
          <span class="card-cost-inline">耗能 ${card.cost}</span>
        </div>
      </div>
      <div class="card-art ${artClass}"${artStyle}></div>
    </article>
  `;
}

function createHandCardElement(card, role, layout) {
  const template = document.createElement("template");
  template.innerHTML = createHandCardMarkup(card, role, layout).trim();
  return template.content.firstElementChild;
}

function getCardById(role, cardId) {
  return currentBattleState?.players?.[role]?.hand?.find((card) => card.id === cardId) || null;
}

function renderCardDetail(card) {
  if (!cardDetailPanel) {
    return;
  }

  if (!card) {
    cardDetailPanel.dataset.state = "empty";
    cardDetailPanel.innerHTML = `
      <p class="card-detail-kicker">技能说明</p>
      <p class="card-detail-empty">选中一张手牌后，这里显示详细效果。</p>
    `;
    return;
  }

  const cardStatusEntries = card ? buildCardStatusDetailEntries(card) : [];
  const description = getCardDescription(card);
  cardDetailPanel.dataset.state = "filled";
  cardDetailPanel.innerHTML = `
    <p class="card-detail-kicker">技能说明</p>
    <div class="card-detail-header">
      <p class="card-detail-name">${card.name}</p>
      <span class="card-detail-cost">耗能 ${card.cost}</span>
    </div>
    <p class="card-detail-effect">${description}</p>
    ${renderDetailStatusSection("附带效果", cardStatusEntries)}
  `;
}

function clearActiveHandCard(handRoot) {
  if (!handRoot) {
    return;
  }

  handRoot.classList.remove("is-previewing");
  handRoot.querySelectorAll(".hand-card").forEach((card) => {
    card.classList.remove("is-active");
  });

  if (handRoot === selfHandRoot && activeSelfCardId) {
    renderCardDetail(lastSelectedSelfCard || getCardById("self", activeSelfCardId));
  }
}

function setActiveHandCard(handRoot, activeCard) {
  if (!handRoot) {
    return;
  }

  clearActiveHandCard(handRoot);

  if (!activeCard) {
    return;
  }

  handRoot.classList.add("is-previewing");
  activeCard.classList.add("is-active");

  if (handRoot === selfHandRoot) {
    activeSelfCardId = activeCard.dataset.cardId || null;
    lastSelectedSelfCard = getCardById("self", activeSelfCardId);
    renderCardDetail(lastSelectedSelfCard);
  }
}

function resetDraggedCard(card) {
  if (!card) {
    return;
  }

  card.classList.remove("is-dragging", "is-armed", "is-shattering");
  card.style.removeProperty("--drag-x");
  card.style.removeProperty("--drag-y");
}

function setActionButtonsDisabled(disabled) {
  if (!disabled) {
    setArchetypeSelectsDisabled(false);
    syncActionButtonsAvailability();
    return;
  }

  setArchetypeSelectsDisabled(true);
  actionButtons.forEach((button) => {
    button.disabled = true;
  });
}

function syncActionButtonsAvailability() {
  actionButtons.forEach((button) => {
    const actionType = button.dataset.action;

    if (isResolvingAction) {
      button.disabled = true;
      return;
    }

    if (actionType === "reset") {
      button.disabled = false;
      return;
    }

    button.disabled =
      !currentBattleState || Boolean(currentBattleState.winner) || currentBattleState.currentTurn !== "self";
  });
}

function getTurnLabel(state) {
  if (state?.winner === "self") {
    return "胜利";
  }

  if (state?.winner === "enemy") {
    return "败北";
  }

  return state?.currentTurn === "enemy" ? "敌方回合" : "我方回合";
}

function updateTurnIndicator(state) {
  if (!turnIndicator) {
    return;
  }

  if (!state) {
    turnIndicator.textContent = "战斗准备";
    return;
  }

  if (state.winner) {
    turnIndicator.textContent = `战斗结束 · ${getTurnLabel(state)}`;
    return;
  }

  turnIndicator.textContent = `第 ${state.turn} 回合 · ${getTurnLabel(state)}`;
}

function updateEnemyIntent(state) {
  if (!enemyIntentNode) {
    return;
  }

  if (state?.winner) {
    enemyIntentNode.textContent = "意图 已终结";
    return;
  }

  if (!state?.enemyIntent) {
    enemyIntentNode.textContent = "意图 暂无";
    return;
  }

  enemyIntentNode.textContent = `意图 ${state.enemyIntent.label} · ${state.enemyIntent.preview}`;
}

function isInsideRoundedRect(localX, localY, width, height, radius) {
  const innerLeft = radius;
  const innerRight = width - radius;
  const innerTop = radius;
  const innerBottom = height - radius;

  if (localX >= innerLeft && localX <= innerRight) {
    return true;
  }

  if (localY >= innerTop && localY <= innerBottom) {
    return true;
  }

  const cornerCenterX = localX < radius ? radius : width - radius;
  const cornerCenterY = localY < radius ? radius : height - radius;
  const dx = localX - cornerCenterX;
  const dy = localY - cornerCenterY;

  return dx * dx + dy * dy <= radius * radius;
}

function resetFxCanvas() {
  if (!fxCanvas || !gameScreen) {
    return null;
  }

  fxCanvas.width = 0;
  fxCanvas.height = 0;
  fxCanvas.style.width = "0px";
  fxCanvas.style.height = "0px";
  fxCanvas.style.left = "0px";
  fxCanvas.style.top = "0px";

  const ctx = fxCanvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 0, 0);
  }

  return null;
}

function resizeFxCanvas(boundsRect) {
  if (!fxCanvas || !gameScreen) {
    return null;
  }

  const rect = gameScreen.getBoundingClientRect();
  const sourceRect = boundsRect || {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
  const localLeft = Math.max(0, sourceRect.left - rect.left);
  const localTop = Math.max(0, sourceRect.top - rect.top);
  const localRight = Math.min(rect.width, sourceRect.left - rect.left + sourceRect.width);
  const localBottom = Math.min(rect.height, sourceRect.top - rect.top + sourceRect.height);
  const localWidth = Math.max(1, localRight - localLeft);
  const localHeight = Math.max(1, localBottom - localTop);
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(localWidth * dpr));
  const height = Math.max(1, Math.round(localHeight * dpr));

  if (fxCanvas.width !== width || fxCanvas.height !== height) {
    fxCanvas.width = width;
    fxCanvas.height = height;
  }

  fxCanvas.style.width = `${localWidth}px`;
  fxCanvas.style.height = `${localHeight}px`;
  fxCanvas.style.left = `${localLeft}px`;
  fxCanvas.style.top = `${localTop}px`;

  const ctx = fxCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, localWidth, localHeight);

  return {
    ctx,
    rect,
    canvasBox: {
      left: localLeft,
      top: localTop,
      width: localWidth,
      height: localHeight,
    },
  };
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function normalizeParticleEffectType(effectType) {
  switch (effectType) {
    case "attack":
      return "damage";
    case "defend":
      return "shield";
    case "energize":
      return "energy";
    default:
      return effectType || "default";
  }
}

const stateThemeCache = new Map();

function readStateThemeToken(name, fallback) {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function getStateVisualTheme(effectType) {
  const normalizedType = normalizeParticleEffectType(effectType);

  if (stateThemeCache.has(normalizedType)) {
    return stateThemeCache.get(normalizedType);
  }

  const fallbackThemes = {
    damage: {
      particle: {
        fill: "#ff9a72",
        shade: "#8d2a21",
        glow: "#ffd3bf",
      },
    },
    shield: {
      particle: {
        fill: "#ffe07a",
        shade: "#8b6412",
        glow: "#fff4bf",
      },
    },
    energy: {
      particle: {
        fill: "#8fdcff",
        shade: "#1d567d",
        glow: "#e3f7ff",
      },
    },
    heal: {
      particle: {
        fill: "#9dffb7",
        shade: "#256c3d",
        glow: "#edfff1",
      },
    },
    buff: {
      particle: {
        fill: "#c6ff8d",
        shade: "#4d6f1d",
        glow: "#f5ffd7",
      },
    },
    debuff: {
      particle: {
        fill: "#ff9ac7",
        shade: "#7a2949",
        glow: "#ffe0ee",
      },
    },
    cleanse: {
      particle: {
        fill: "#b9fff4",
        shade: "#23655e",
        glow: "#ebfffb",
      },
    },
    default: {
      particle: {
        fill: "#ffe596",
        shade: "#6b5530",
        glow: "#fff5cf",
      },
    },
  };

  const fallbackTheme = fallbackThemes[normalizedType] || fallbackThemes.default;
  const theme = {
    particle: {
      fill: readStateThemeToken(`--state-${normalizedType}-particle-fill`, fallbackTheme.particle.fill),
      shade: readStateThemeToken(`--state-${normalizedType}-particle-shade`, fallbackTheme.particle.shade),
      glow: readStateThemeToken(`--state-${normalizedType}-particle-glow`, fallbackTheme.particle.glow),
    },
  };

  stateThemeCache.set(normalizedType, theme);
  return theme;
}

function getPixelParticlePalette(effectType) {
  return getStateVisualTheme(effectType).particle;
}

function getParticleEffectProfile(effectType) {
  const normalizedType = normalizeParticleEffectType(effectType);
  const baseProfile = {
    type: normalizedType,
    palette: getPixelParticlePalette(normalizedType),
    renderStyle: "pixel",
    impactStyle: "pixel-burst",
    feedbackDelay: 0,
    delaySpread: 220,
    delayJitter: 60,
    durationBase: 920,
    durationJitter: 120,
    burstDuration: 90,
    absorbLead: 24,
    burstMagnitude: 10,
    burstJitter: 4,
    swirlMagnitude: 22,
    swirlBias: 0,
    targetSpread: 0,
    sizeBase: 2,
    sizeRange: 3,
    pixelStepBase: 2,
    pixelStepRange: 2,
    motionStepsBase: 8,
    motionStepsRange: 5,
  };

  if (normalizedType === "damage") {
    return {
      ...baseProfile,
      renderStyle: "slash",
      impactStyle: "slash-burst",
      feedbackDelay: 720,
      delaySpread: 110,
      delayJitter: 36,
      durationBase: 640,
      durationJitter: 90,
      burstDuration: 64,
      absorbLead: 10,
      burstMagnitude: 15,
      burstJitter: 3,
      swirlMagnitude: 8,
      swirlBias: 4,
      targetSpread: 14,
      sizeBase: 2,
      sizeRange: 2,
      pixelStepBase: 2,
      pixelStepRange: 1,
      motionStepsBase: 12,
      motionStepsRange: 4,
    };
  }

  if (normalizedType === "shield") {
    return {
      ...baseProfile,
      renderStyle: "shield",
      impactStyle: "shield-burst",
      feedbackDelay: 760,
      delaySpread: 170,
      delayJitter: 44,
      durationBase: 960,
      durationJitter: 140,
      burstDuration: 82,
      absorbLead: 18,
      burstMagnitude: 11,
      burstJitter: 3,
      swirlMagnitude: 14,
      targetSpread: 12,
      sizeBase: 2,
      sizeRange: 2,
    };
  }

  if (normalizedType === "energy") {
    return {
      ...baseProfile,
      renderStyle: "spark",
      impactStyle: "spark-burst",
      feedbackDelay: 800,
      delaySpread: 160,
      delayJitter: 52,
      durationBase: 980,
      durationJitter: 150,
      burstDuration: 76,
      absorbLead: 16,
      burstMagnitude: 12,
      burstJitter: 4,
      swirlMagnitude: 24,
      swirlBias: 6,
      targetSpread: 16,
      sizeBase: 2,
      sizeRange: 2,
      motionStepsBase: 10,
      motionStepsRange: 4,
    };
  }

  if (normalizedType === "heal") {
    return {
      ...baseProfile,
      renderStyle: "spark",
      impactStyle: "spark-burst",
      feedbackDelay: 520,
      durationBase: 760,
      durationJitter: 100,
      burstMagnitude: 9,
      swirlMagnitude: 18,
      targetSpread: 10,
    };
  }

  if (normalizedType === "buff") {
    return {
      ...baseProfile,
      renderStyle: "shield",
      impactStyle: "shield-burst",
      feedbackDelay: 560,
      durationBase: 820,
      durationJitter: 110,
      burstMagnitude: 10,
      swirlMagnitude: 16,
      targetSpread: 12,
    };
  }

  if (normalizedType === "debuff" || normalizedType === "cleanse") {
    return {
      ...baseProfile,
      renderStyle: "pixel",
      impactStyle: "pixel-burst",
      feedbackDelay: 520,
      durationBase: 780,
      durationJitter: 120,
      burstMagnitude: 9,
      swirlMagnitude: 18,
      targetSpread: 12,
    };
  }

  return baseProfile;
}

function snapToPixelGrid(value, step = 2) {
  const safeStep = Math.max(1, step);
  return Math.round(value / safeStep) * safeStep;
}

function getParticleAxis(value, fallback) {
  if (Math.abs(value) < 0.001) {
    return fallback;
  }

  return value > 0 ? 1 : -1;
}

function drawPixelParticle(ctx, particle, px, py, pixelSize) {
  ctx.fillStyle = particle.palette.shade;
  ctx.fillRect(px - 1, py - 1, pixelSize + 2, pixelSize + 2);
  ctx.fillStyle = particle.palette.fill;
  ctx.fillRect(px, py, pixelSize, pixelSize);

  if (pixelSize >= 3) {
    ctx.fillStyle = particle.palette.glow;
    ctx.fillRect(px, py, Math.max(1, pixelSize - 2), 1);
    ctx.fillRect(px, py + 1, 1, Math.max(1, pixelSize - 2));
  }
}

function fillSlashSegments(ctx, px, py, unit, dirX, dirY) {
  const forwardX = getParticleAxis(dirX, 0);
  const forwardY = getParticleAxis(dirY, -1);
  const perpX = -forwardY;
  const perpY = forwardX;
  const segments = [
    { along: -2, across: 0, scale: 1 },
    { along: -1, across: 0, scale: 1 },
    { along: 0, across: 0, scale: 1 },
    { along: 1, across: 0, scale: 1 },
    { along: 2, across: 0, scale: 1 },
    { along: -1, across: -1, scale: 1 },
    { along: 0, across: 1, scale: 1 },
    { along: 2, across: 1, scale: 1 },
    { along: 3, across: 0, scale: 1 },
  ];

  segments.forEach((segment) => {
    const size = Math.max(1, Math.round(unit * segment.scale));
    const x = px + (forwardX * segment.along + perpX * segment.across) * unit;
    const y = py + (forwardY * segment.along + perpY * segment.across) * unit;
    ctx.fillRect(x, y, size, size);
  });
}

function drawSlashParticle(ctx, particle, px, py, pixelSize) {
  const unit = Math.max(2, pixelSize - 1);
  const dirX = particle.travelX;
  const dirY = particle.travelY;

  ctx.fillStyle = particle.palette.shade;
  fillSlashSegments(ctx, px - 1, py - 1, unit, dirX, dirY);
  ctx.fillStyle = particle.palette.fill;
  fillSlashSegments(ctx, px, py, unit, dirX, dirY);
  ctx.fillStyle = particle.palette.glow;
  fillSlashSegments(ctx, px + getParticleAxis(dirX, 0), py + getParticleAxis(dirY, -1), 1, dirX, dirY);
}

function drawShieldParticle(ctx, particle, px, py, pixelSize) {
  const unit = Math.max(2, pixelSize - 1);

  ctx.fillStyle = particle.palette.shade;
  ctx.fillRect(px - unit, py - unit * 2, unit * 2, unit);
  ctx.fillRect(px - unit * 2, py - unit, unit, unit * 2);
  ctx.fillRect(px + unit, py - unit, unit, unit * 2);
  ctx.fillRect(px - unit, py + unit, unit * 2, unit);
  ctx.fillRect(px - unit, py + unit * 2, unit * 2, unit);

  ctx.fillStyle = particle.palette.fill;
  ctx.fillRect(px, py - unit * 2, unit, unit);
  ctx.fillRect(px - unit, py - unit, unit * 3, unit * 2);
  ctx.fillRect(px, py + unit, unit, unit * 2);

  ctx.fillStyle = particle.palette.glow;
  ctx.fillRect(px, py - unit, unit, unit * 2);
  ctx.fillRect(px - unit, py, unit * 3, unit);
}

function drawSparkParticle(ctx, particle, px, py, pixelSize) {
  const unit = Math.max(2, pixelSize - 1);
  const dirX = getParticleAxis(particle.travelX, 0);
  const dirY = getParticleAxis(particle.travelY, -1);
  const perpX = -dirY;
  const perpY = dirX;

  ctx.fillStyle = particle.palette.shade;
  ctx.fillRect(px - perpX * unit - unit, py - perpY * unit - unit, unit * 2, unit * 2);
  ctx.fillRect(px + dirX * unit - unit, py + dirY * unit - unit, unit * 2, unit * 2);
  ctx.fillRect(px - dirX * unit * 2 - unit, py - dirY * unit * 2 - unit, unit * 2, unit * 2);

  ctx.fillStyle = particle.palette.fill;
  ctx.fillRect(px, py - unit * 2, unit, unit * 2);
  ctx.fillRect(px - unit, py, unit * 3, unit);
  ctx.fillRect(px + dirX * unit, py + dirY * unit, unit, unit * 2);
  ctx.fillRect(px - dirX * unit, py - dirY * unit, unit, unit * 2);

  ctx.fillStyle = particle.palette.glow;
  ctx.fillRect(px, py - unit, unit, unit);
  ctx.fillRect(px + perpX * unit, py + perpY * unit, unit, unit);
  ctx.fillRect(px - perpX * unit, py - perpY * unit, unit, unit);
}

const PARTICLE_RENDERERS = {
  pixel: drawPixelParticle,
  slash: drawSlashParticle,
  shield: drawShieldParticle,
  spark: drawSparkParticle,
};

function renderParticleSprite(ctx, particle, px, py, pixelSize) {
  const renderParticle = PARTICLE_RENDERERS[particle.renderStyle] || drawPixelParticle;

  renderParticle(ctx, particle, px, py, pixelSize);
}

function drawPixelImpact(ctx, impact, progress) {
  const unit = 2 + Math.round(progress * 2);
  const radius = 4 + Math.round(progress * 12);
  const px = snapToPixelGrid(impact.x, 2);
  const py = snapToPixelGrid(impact.y, 2);

  ctx.fillStyle = impact.palette.shade;
  ctx.fillRect(px - radius - unit, py - unit, radius * 2 + unit * 2, unit * 2);
  ctx.fillRect(px - unit, py - radius - unit, unit * 2, radius * 2 + unit * 2);

  ctx.fillStyle = impact.palette.fill;
  ctx.fillRect(px - radius, py, radius * 2, unit);
  ctx.fillRect(px, py - radius, unit, radius * 2);

  ctx.fillStyle = impact.palette.glow;
  ctx.fillRect(px - unit, py - unit, unit * 2, unit * 2);
}

function drawSlashImpact(ctx, impact, progress) {
  const unit = 2 + Math.round((1 - progress * 0.4) * 2);
  const reach = 5 + Math.round(progress * 15);
  const dirX = getParticleAxis(impact.dirX, 0);
  const dirY = getParticleAxis(impact.dirY, -1);
  const perpX = -dirY;
  const perpY = dirX;
  const px = snapToPixelGrid(impact.x, 2);
  const py = snapToPixelGrid(impact.y, 2);

  ctx.fillStyle = impact.palette.shade;
  for (let index = -1; index <= 2; index += 1) {
    const x = px + dirX * index * reach + perpX * unit;
    const y = py + dirY * index * reach + perpY * unit;
    ctx.fillRect(x - unit, y - unit, unit * 2, unit * 2);
  }

  ctx.fillStyle = impact.palette.fill;
  for (let index = -1; index <= 2; index += 1) {
    const x = px + dirX * index * reach;
    const y = py + dirY * index * reach;
    ctx.fillRect(x, y, unit * 2, unit * 2);
  }

  ctx.fillStyle = impact.palette.glow;
  ctx.fillRect(px - unit, py - unit, unit * 2, unit * 2);
  ctx.fillRect(px + perpX * unit * 2, py + perpY * unit * 2, unit, unit);
  ctx.fillRect(px - perpX * unit * 2, py - perpY * unit * 2, unit, unit);
}

function drawShieldImpact(ctx, impact, progress) {
  const px = snapToPixelGrid(impact.x, 2);
  const py = snapToPixelGrid(impact.y, 2);
  const unit = 2 + Math.round((1 - progress * 0.3) * 2);
  const outer = 8 + Math.round(progress * 10);
  const inner = Math.max(unit * 2, outer - unit * 3);

  ctx.fillStyle = impact.palette.shade;
  ctx.fillRect(px - outer, py - outer, outer * 2, unit);
  ctx.fillRect(px - outer, py + outer - unit, outer * 2, unit);
  ctx.fillRect(px - outer, py - outer, unit, outer * 2);
  ctx.fillRect(px + outer - unit, py - outer, unit, outer * 2);

  ctx.fillStyle = impact.palette.fill;
  ctx.fillRect(px - inner, py - inner, inner * 2, unit);
  ctx.fillRect(px - inner, py + inner - unit, inner * 2, unit);
  ctx.fillRect(px - inner, py - inner, unit, inner * 2);
  ctx.fillRect(px + inner - unit, py - inner, unit, inner * 2);

  ctx.fillStyle = impact.palette.glow;
  ctx.fillRect(px - unit, py - outer, unit * 2, unit);
  ctx.fillRect(px - unit, py + outer - unit, unit * 2, unit);
  ctx.fillRect(px - outer, py - unit, unit, unit * 2);
  ctx.fillRect(px + outer - unit, py - unit, unit, unit * 2);
}

function drawSparkImpact(ctx, impact, progress) {
  const px = snapToPixelGrid(impact.x, 2);
  const py = snapToPixelGrid(impact.y, 2);
  const unit = 2 + Math.round((1 - progress * 0.25) * 2);
  const reach = 6 + Math.round(progress * 11);
  const dirX = getParticleAxis(impact.dirX, 0);
  const dirY = getParticleAxis(impact.dirY, -1);
  const perpX = -dirY;
  const perpY = dirX;

  ctx.fillStyle = impact.palette.shade;
  ctx.fillRect(px - unit, py - reach, unit * 2, unit * 2);
  ctx.fillRect(px - unit, py + reach - unit, unit * 2, unit * 2);
  ctx.fillRect(px - reach, py - unit, unit * 2, unit * 2);
  ctx.fillRect(px + reach - unit, py - unit, unit * 2, unit * 2);

  ctx.fillStyle = impact.palette.fill;
  ctx.fillRect(px - unit, py - unit * 2, unit * 2, unit * 4);
  ctx.fillRect(px - unit * 2, py - unit, unit * 4, unit * 2);
  ctx.fillRect(px + dirX * reach - unit, py + dirY * reach - unit, unit * 2, unit * 2);
  ctx.fillRect(px - dirX * reach - unit, py - dirY * reach - unit, unit * 2, unit * 2);

  ctx.fillStyle = impact.palette.glow;
  ctx.fillRect(px - unit, py - unit, unit * 2, unit * 2);
  ctx.fillRect(px + perpX * reach - unit, py + perpY * reach - unit, unit * 2, unit * 2);
  ctx.fillRect(px - perpX * reach - unit, py - perpY * reach - unit, unit * 2, unit * 2);
}

const IMPACT_RENDERERS = {
  "pixel-burst": drawPixelImpact,
  "slash-burst": drawSlashImpact,
  "shield-burst": drawShieldImpact,
  "spark-burst": drawSparkImpact,
};

function renderImpactSprite(ctx, impact, progress) {
  const renderImpact = IMPACT_RENDERERS[impact.renderStyle] || drawPixelImpact;

  renderImpact(ctx, impact, progress);
}

function getHandOverlap(count) {
  return count > 1 ? Math.max(0, Math.ceil((count * CARD_WIDTH - HAND_MAX_SPAN) / (count - 1))) : 0;
}

function findDrawnCard(previousHand = [], nextHand = []) {
  const previousIds = new Set(previousHand.map((card) => card.id));
  return nextHand.find((card) => !previousIds.has(card.id)) || null;
}

function buildHandLayoutMap(hand = [], role) {
  return new Map(
    hand.map((card, index) => [card.id, { index, layout: getHandLayout(hand.length, index, role) }])
  );
}

function captureHandCardRects(role) {
  const handRoot = document.querySelector(`[data-hand="${role}"]`);

  if (!handRoot) {
    return new Map();
  }

  return new Map(
    Array.from(handRoot.querySelectorAll(".hand-card")).map((card) => [
      card.dataset.cardId,
      card.getBoundingClientRect(),
    ])
  );
}

function measureHandCardRects(role, hand = []) {
  if (!gameScreen || !hand.length) {
    return new Map();
  }

  const sourceHandRoot = document.querySelector(`[data-hand="${role}"]`);

  if (!sourceHandRoot) {
    return new Map();
  }

  const handZone = sourceHandRoot.closest(".hand-zone");

  if (!handZone) {
    return new Map();
  }

  const gameRect = gameScreen.getBoundingClientRect();
  const handZoneRect = handZone.getBoundingClientRect();
  const measureZone = document.createElement("section");
  const measureFan = document.createElement("div");
  const overlap = getHandOverlap(hand.length);

  measureZone.className = `hand-zone ${role} is-measuring`;
  measureZone.setAttribute("aria-hidden", "true");
  measureZone.style.left = `${handZoneRect.left - gameRect.left}px`;
  measureZone.style.top = `${handZoneRect.top - gameRect.top}px`;
  measureZone.style.width = `${handZoneRect.width}px`;
  measureZone.style.bottom = "auto";
  measureZone.style.transform = "none";

  measureFan.className = "hand-fan";
  measureFan.style.setProperty("--card-overlap", `${overlap}px`);
  measureFan.innerHTML = hand
    .map((card, index) => createHandCardMarkup(card, role, getHandLayout(hand.length, index, role)))
    .join("");

  measureZone.appendChild(measureFan);
  gameScreen.appendChild(measureZone);

  const rects = new Map(
    Array.from(measureFan.querySelectorAll(".hand-card")).map((card) => [
      card.dataset.cardId,
      card.getBoundingClientRect(),
    ])
  );

  measureZone.remove();

  return rects;
}

function clearFlipStyles(card, options = {}) {
  const { removeTransition = true } = options;

  card.style.removeProperty("--flip-x");
  card.style.removeProperty("--flip-y");
  card.style.removeProperty("--flip-rotate");

  if (removeTransition) {
    card.style.removeProperty("transition");
  }
}

function waitForAnimation(animation, duration) {
  if (animation?.finished) {
    return animation.finished.catch(() => undefined);
  }

  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function waitForNextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function reserveEmptySelfHandHeight(handRoot, role, previousHand = []) {
  if (!handRoot || role !== "self" || previousHand.length > 0) {
    return () => {};
  }

  handRoot.style.minHeight = `${CARD_HEIGHT}px`;

  return () => {
    handRoot.style.removeProperty("min-height");
  };
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function getSegmentProgress(progress, start, end) {
  if (end <= start) {
    return progress >= end ? 1 : 0;
  }

  return clamp01((progress - start) / (end - start));
}

async function animateDrawToHand(role, previousState, nextState) {
  const previousHand = previousState?.players?.[role]?.hand ?? [];
  const nextHand = nextState?.players?.[role]?.hand ?? [];

  if (nextHand.length !== previousHand.length + 1) {
    renderBattleState(nextState);
    return;
  }

  const drawnCard = findDrawnCard(previousHand, nextHand);
  const sourcePile = document.querySelector(`[data-player="${role}"] [data-player-deck-stack]`);

  if (!gameScreen || !drawnCard || !sourcePile) {
    renderBattleState(nextState);
    return;
  }

  const handRoot = document.querySelector(`[data-hand="${role}"]`);

  if (!handRoot) {
    renderBattleState(nextState);
    return;
  }

  const releaseReservedHandHeight = reserveEmptySelfHandHeight(handRoot, role, previousHand);

  try {
    const sourceRect = sourcePile.getBoundingClientRect();
    const firstRects = captureHandCardRects(role);
    const previousLayoutMap = buildHandLayoutMap(previousHand, role);
    const nextLayoutMap = buildHandLayoutMap(nextHand, role);
    const finalLayout =
      nextLayoutMap.get(drawnCard.id)?.layout ??
      getHandLayout(nextHand.length, nextHand.length - 1, role);
    const hiddenTargetCard = createHandCardElement(drawnCard, role, finalLayout);
    const injectedNodes = new Map([[drawnCard.id, hiddenTargetCard]]);

    hiddenTargetCard.classList.add("is-draw-target-hidden");
    hiddenTargetCard.setAttribute("aria-hidden", "true");

    patchHand(role, nextHand, injectedNodes);

    const targetRects = captureHandCardRects(role);
    const targetRect = targetRects.get(drawnCard.id);

    if (!targetRect) {
      renderBattleState(nextState);
      return;
    }

    const gameRect = gameScreen.getBoundingClientRect();
    const handRootRect = handRoot.getBoundingClientRect();
    const startX = sourceRect.left - handRootRect.left + sourceRect.width / 2 - CARD_WIDTH / 2;
    const startY = sourceRect.top - handRootRect.top + sourceRect.height / 2 - CARD_HEIGHT / 2;
    const totalDuration = 1000;
    const centerHoldDuration = 420;
    const originalArrivalDuration = 1000;
    const originalReturnDuration = 330;
    const totalMoveDuration = totalDuration - centerHoldDuration;
    const centerArrivalDuration =
      (totalMoveDuration * originalArrivalDuration) /
      (originalArrivalDuration + originalReturnDuration);
    const centerArrivalOffset = centerArrivalDuration / totalDuration;
    const centerHoldOffset = (centerArrivalDuration + centerHoldDuration) / totalDuration;
    const initialTilt = role === "self" ? 10 : -10;
    const flightCard = createHandCardElement(drawnCard, role, finalLayout);
    const sharedCards = [];

    Array.from(handRoot.querySelectorAll(".hand-card"))
      .filter((card) => card.dataset.cardId !== drawnCard.id)
      .forEach((card) => {
        const cardId = card.dataset.cardId;
        const firstRect = firstRects.get(cardId);
        const finalRect = targetRects.get(cardId);

        if (!firstRect || !finalRect) {
          return;
        }

        const previousLayout = previousLayoutMap.get(cardId)?.layout;
        const nextLayout = nextLayoutMap.get(cardId)?.layout;
        const dx = firstRect.left - finalRect.left;
        const dy = firstRect.top - finalRect.top;
        const rotate = (previousLayout?.angle ?? 0) - (nextLayout?.angle ?? 0);

        card.style.transition = "none";
        card.style.setProperty("--flip-x", `${dx}px`);
        card.style.setProperty("--flip-y", `${dy}px`);
        card.style.setProperty("--flip-rotate", `${rotate}deg`);
        sharedCards.push({ card, dx, dy, rotate });
      });

    flightCard.classList.add("draw-flight-card");
    flightCard.setAttribute("aria-hidden", "true");
    flightCard.style.left = `${startX}px`;
    flightCard.style.top = `${startY}px`;
    flightCard.style.visibility = "hidden";

    handRoot.appendChild(flightCard);

    handRoot.getBoundingClientRect();
    flightCard.style.transform = "translate3d(0px, 0px, 0) rotate(0deg) scale(1.34)";
    const flightCardCenterRect = flightCard.getBoundingClientRect();
    const centerDx =
      gameRect.left + gameRect.width / 2 - (flightCardCenterRect.left + flightCardCenterRect.width / 2);
    const centerDy =
      gameRect.top + gameRect.height / 2 - (flightCardCenterRect.top + flightCardCenterRect.height / 2);
    flightCard.style.transform = `translate3d(0px, 0px, 0) rotate(${finalLayout.angle}deg) scale(1)`;
    const flightCardFinalRect = flightCard.getBoundingClientRect();
    const returnDx = targetRect.left - flightCardFinalRect.left;
    const returnDy = targetRect.top - flightCardFinalRect.top;
    flightCard.style.removeProperty("transform");
    flightCard.style.removeProperty("visibility");
    await waitForNextFrame();

    flightCard.style.transform = `translate(0px, 0px) rotate(${initialTilt}deg) scale(0.28)`;
    flightCard.style.opacity = "0.82";

    await waitForNextFrame();
    await waitForNextFrame();

    await new Promise((resolve) => {
      const startTime = performance.now();

      function frame(now) {
        const progress = clamp01((now - startTime) / totalDuration);
        let tx = 0;
        let ty = 0;
        let rotate = initialTilt;
        let scale = 0.28;
        let opacity = 0.82;

        if (progress <= centerArrivalOffset) {
          const t = easeInOutCubic(getSegmentProgress(progress, 0, centerArrivalOffset));
          const scaleProgress = easeOutCubic(t);
          const arcLift = Math.sin(t * Math.PI) * 14;

          tx = lerp(0, centerDx, t);
          ty = lerp(0, centerDy, t) - arcLift;
          rotate = lerp(initialTilt, 0, t);
          scale = lerp(0.28, 1.34, scaleProgress);
          opacity = lerp(0.82, 1, scaleProgress);
        } else if (progress <= centerHoldOffset) {
          const t = easeInOutCubic(getSegmentProgress(progress, centerArrivalOffset, centerHoldOffset));
          tx = centerDx;
          ty = centerDy;
          rotate = 0;
          scale = lerp(1.34, 1.28, t);
          opacity = 1;
        } else {
          const t = easeInOutCubic(getSegmentProgress(progress, centerHoldOffset, 1));
          const settleLift = Math.sin((1 - t) * Math.PI) * 8;

          tx = lerp(centerDx, returnDx, t);
          ty = lerp(centerDy, returnDy, t) - settleLift;
          rotate = lerp(0, finalLayout.angle, t);
          scale = lerp(1.28, 1, t);
          opacity = 1;
        }

        flightCard.style.transform = `translate3d(${tx}px, ${ty}px, 0) rotate(${rotate}deg) scale(${scale})`;
        flightCard.style.opacity = String(opacity);

        if (progress >= centerHoldOffset) {
          const handShiftProgress = easeInOutCubic(getSegmentProgress(progress, centerHoldOffset, 1));

          sharedCards.forEach(({ card, dx, dy, rotate: rotateDelta }) => {
            card.style.setProperty("--flip-x", `${lerp(dx, 0, handShiftProgress)}px`);
            card.style.setProperty("--flip-y", `${lerp(dy, 0, handShiftProgress)}px`);
            card.style.setProperty("--flip-rotate", `${lerp(rotateDelta, 0, handShiftProgress)}deg`);
          });
        }

        if (progress < 1) {
          requestAnimationFrame(frame);
          return;
        }

        resolve();
      }

      requestAnimationFrame(frame);
    });

    flightCard.remove();
    hiddenTargetCard.style.transition = "none";
    hiddenTargetCard.classList.remove("is-draw-target-hidden");
    hiddenTargetCard.removeAttribute("aria-hidden");
    sharedCards.forEach(({ card }) => {
      card.style.transition = "none";
      clearFlipStyles(card, { removeTransition: false });
    });
    handRoot.getBoundingClientRect();
    hiddenTargetCard.style.removeProperty("transition");
    sharedCards.forEach(({ card }) => {
      card.style.removeProperty("transition");
    });
    updatePlayer(role, nextState.players[role], { renderHandCards: false });
    updateBattleStatus(nextState);
    currentBattleState = nextState;
  } finally {
    releaseReservedHandHeight();
  }
}

function animateCardShatterToDiscard(card, options = {}) {
  const { targetRole = "self", hideCardFirst = false, targetDescriptors = [] } = options;
  const shouldRestoreCardVisibility = !hideCardFirst;
  const targetPile = document.querySelector(
    `[data-player="${targetRole}"] [data-player-discard-stack]`
  );
  const cardRect = card.getBoundingClientRect();
  const fallbackTargetRect = targetPile?.getBoundingClientRect();
  const activeTargets = targetDescriptors.length
    ? targetDescriptors.filter((descriptor) => descriptor?.rect)
    : fallbackTargetRect
      ? [
          {
            role: targetRole,
            type: "discard",
            amount: 1,
            weight: 1,
            rect: fallbackTargetRect,
          },
        ]
      : [];
  const effectPadding = 56;
  const effectBounds =
    cardRect && activeTargets.length
      ? {
          left: Math.min(cardRect.left, ...activeTargets.map((target) => target.rect.left)) - effectPadding,
          top: Math.min(cardRect.top, ...activeTargets.map((target) => target.rect.top)) - effectPadding,
          width:
            Math.max(cardRect.right, ...activeTargets.map((target) => target.rect.right)) -
            Math.min(cardRect.left, ...activeTargets.map((target) => target.rect.left)) +
            effectPadding * 2,
          height:
            Math.max(cardRect.bottom, ...activeTargets.map((target) => target.rect.bottom)) -
            Math.min(cardRect.top, ...activeTargets.map((target) => target.rect.top)) +
            effectPadding * 2,
        }
      : null;
  const canvasState = resizeFxCanvas(effectBounds);

  if (!gameScreen || !fxCanvas || !activeTargets.length || !canvasState) {
    card.classList.add("is-shattering");
    return new Promise((resolve) => window.setTimeout(resolve, 260));
  }

  const { ctx, rect: gameRect, canvasBox } = canvasState;
  const particleCount = 100;
  const cornerRadius = 12;
  const totalTargetWeight = activeTargets.reduce((sum, target) => sum + (target.weight || 1), 0);
  const particles = [];
  const impacts = activeTargets.map((target) => {
    const effectProfile = getParticleEffectProfile(target.type);
    const centerX = target.rect.left - gameRect.left - canvasBox.left + target.rect.width / 2;
    const centerY = target.rect.top - gameRect.top - canvasBox.top + target.rect.height / 2;
    const cardCenterX = cardRect.left - gameRect.left - canvasBox.left + cardRect.width / 2;
    const cardCenterY = cardRect.top - gameRect.top - canvasBox.top + cardRect.height / 2;
    const travelX = centerX - cardCenterX;
    const travelY = centerY - cardCenterY;
    const travelDistance = Math.hypot(travelX, travelY) || 1;

    return {
      x: centerX,
      y: centerY,
      dirX: travelX / travelDistance,
      dirY: travelY / travelDistance,
      palette: effectProfile.palette,
      renderStyle: effectProfile.impactStyle,
      startDelay: Math.max(120, effectProfile.feedbackDelay - 80),
      duration: target.type === "damage" ? 260 : 300,
    };
  });

  card.classList.remove("is-active", "is-armed", "is-dragging");
  card.classList.add("is-shattering");

  let attempts = 0;

  while (particles.length < particleCount && attempts < particleCount * 20) {
    attempts += 1;

    const localX = Math.random() * cardRect.width;
    const localY = Math.random() * cardRect.height;

    if (!isInsideRoundedRect(localX, localY, cardRect.width, cardRect.height, cornerRadius)) {
      continue;
    }

    const originX = cardRect.left - gameRect.left - canvasBox.left + localX;
    const originY = cardRect.top - gameRect.top - canvasBox.top + localY;
    const waveOrder =
      (1 - localY / cardRect.height) * 0.72 + (1 - localX / cardRect.width) * 0.28;
    let targetCursor = Math.random() * totalTargetWeight;
    let assignedTarget = activeTargets[activeTargets.length - 1];

    for (const target of activeTargets) {
      targetCursor -= target.weight || 1;

      if (targetCursor <= 0) {
        assignedTarget = target;
        break;
      }
    }

    const targetX = assignedTarget.rect.left - gameRect.left - canvasBox.left + assignedTarget.rect.width / 2;
    const targetY = assignedTarget.rect.top - gameRect.top - canvasBox.top + assignedTarget.rect.height / 2;
    const effectProfile = getParticleEffectProfile(assignedTarget.type);
    const travelX = targetX - originX;
    const travelY = targetY - originY;
    const travelDistance = Math.hypot(travelX, travelY) || 1;
    const directionX = travelX / travelDistance;
    const directionY = travelY / travelDistance;
    const perpendicularX = -directionY;
    const perpendicularY = directionX;
    const localHorizontal = localX / cardRect.width - 0.5;
    const localVertical = localY / cardRect.height - 0.5;
    const targetSpread = (Math.random() - 0.5) * effectProfile.targetSpread;
    const burstForward =
      effectProfile.burstMagnitude * (0.72 + Math.random() * 0.28) +
      (Math.random() * effectProfile.burstJitter - effectProfile.burstJitter / 2);
    const burstSide =
      (localHorizontal * 0.65 + (Math.random() - 0.5) * 0.35) * effectProfile.burstMagnitude;
    const swirlAmount =
      (localVertical * 0.8 + (Math.random() - 0.5) * 0.2) * effectProfile.swirlMagnitude +
      Math.sign(localHorizontal || 1) * effectProfile.swirlBias;
    const delay = Math.round(
      waveOrder * effectProfile.delaySpread + Math.random() * effectProfile.delayJitter
    );

    particles.push({
      x: originX,
      y: originY,
      travelX: directionX,
      travelY: directionY,
      burstX: directionX * burstForward + perpendicularX * burstSide,
      burstY: directionY * burstForward + perpendicularY * burstSide,
      absorbX: travelX + perpendicularX * targetSpread,
      absorbY: travelY + perpendicularY * targetSpread,
      swirlX: perpendicularX * swirlAmount,
      swirlY: perpendicularY * swirlAmount,
      delay,
      duration: effectProfile.durationBase + Math.random() * effectProfile.durationJitter,
      size: effectProfile.sizeBase + Math.floor(Math.random() * effectProfile.sizeRange),
      pixelStep: effectProfile.pixelStepBase + Math.floor(Math.random() * effectProfile.pixelStepRange),
      motionSteps: effectProfile.motionStepsBase + Math.floor(Math.random() * effectProfile.motionStepsRange),
      burstDuration: effectProfile.burstDuration,
      absorbLead: effectProfile.absorbLead,
      palette: effectProfile.palette,
      renderStyle: effectProfile.renderStyle,
    });
  }

  const totalDuration = particles.reduce(
    (max, particle) => Math.max(max, particle.delay + particle.duration),
    0
  );
  const totalImpactDuration = impacts.reduce(
    (max, impact) => Math.max(max, impact.startDelay + impact.duration),
    0
  );
  const resolvedDuration = Math.max(totalDuration, totalImpactDuration);

  const animation = new Promise((resolve) => {
    const begin = () => {
      const start = performance.now();

      function frame(now) {
        const elapsed = now - start;

        ctx.clearRect(0, 0, canvasBox.width, canvasBox.height);

        for (const particle of particles) {
          const localElapsed = elapsed - particle.delay;

          if (localElapsed < 0) {
            continue;
          }

          const burstProgress = Math.min(1, localElapsed / particle.burstDuration);
          const absorbProgress = Math.min(
            1,
            Math.max(0, localElapsed - particle.absorbLead) / particle.duration
          );
          const burstEase = easeOutCubic(burstProgress);
          const absorbEase = easeInOutCubic(absorbProgress);
          const steppedBurstEase =
            Math.round(burstEase * Math.max(3, particle.motionSteps * 0.6)) /
            Math.max(3, particle.motionSteps * 0.6);
          const steppedAbsorbEase =
            Math.round(absorbEase * particle.motionSteps) / particle.motionSteps;
          const swirlFactor = 1 - steppedAbsorbEase;
          const x =
            particle.x +
            particle.burstX * steppedBurstEase +
            particle.absorbX * steppedAbsorbEase +
            particle.swirlX * swirlFactor;
          const y =
            particle.y +
            particle.burstY * steppedBurstEase +
            particle.absorbY * steppedAbsorbEase +
            particle.swirlY * swirlFactor;
          const alpha =
            steppedAbsorbEase > 0.96 ? 1 - (steppedAbsorbEase - 0.96) / 0.04 : 1;

          if (alpha <= 0) {
            continue;
          }

          const pixelSize = Math.max(2, Math.round(particle.size * (1 - steppedAbsorbEase * 0.28)));
          const px = snapToPixelGrid(x, particle.pixelStep);
          const py = snapToPixelGrid(y, particle.pixelStep);

          ctx.globalAlpha = alpha;
          renderParticleSprite(ctx, particle, px, py, pixelSize);
        }
        ctx.globalAlpha = 1;

        for (const impact of impacts) {
          const localElapsed = elapsed - impact.startDelay;

          if (localElapsed < 0 || localElapsed > impact.duration) {
            continue;
          }

          const progress = clamp01(localElapsed / impact.duration);
          const alpha = progress < 0.75 ? 1 : 1 - (progress - 0.75) / 0.25;

          if (alpha <= 0) {
            continue;
          }

          ctx.globalAlpha = alpha;
          renderImpactSprite(ctx, impact, progress);
        }

        ctx.globalAlpha = 1;

        if (elapsed < resolvedDuration + 40) {
          requestAnimationFrame(frame);
          return;
        }

        ctx.clearRect(0, 0, canvasBox.width, canvasBox.height);
        resolve();
      }

      requestAnimationFrame(frame);
    };

    if (hideCardFirst) {
      card.style.opacity = "0";
      card.style.visibility = "hidden";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => begin());
      });
      return;
    }

    begin();
  }).finally(() => {
    card.classList.remove("is-shattering");
    card.style.removeProperty("--drag-x");
    card.style.removeProperty("--drag-y");

    if (shouldRestoreCardVisibility) {
      card.style.removeProperty("opacity");
      card.style.removeProperty("visibility");
    }

    resetFxCanvas();
  });

  animation.totalDuration = resolvedDuration + 40;
  return animation;
}

async function animateCardReturnToHand(card) {
  if (!card) {
    return;
  }

  card.classList.remove("is-armed");
  card.style.transition = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";

  await waitForNextFrame();

  card.style.setProperty("--drag-x", "0px");
  card.style.setProperty("--drag-y", "0px");

  await new Promise((resolve) => window.setTimeout(resolve, 220));

  resetDraggedCard(card);
  card.style.removeProperty("transition");
}

function animatePlayerHit(role) {
  const playerCard = document.querySelector(`[data-player="${role}"]`);

  if (!playerCard) {
    return Promise.resolve();
  }

  playerCard.classList.remove("is-receiving-shield", "is-receiving-energy");
  playerCard.classList.remove("is-taking-hit");
  playerCard.getBoundingClientRect();
  playerCard.classList.add("is-taking-hit");

  return new Promise((resolve) => {
    window.setTimeout(() => {
      playerCard.classList.remove("is-taking-hit");
      resolve();
    }, 240);
  });
}

function animatePlayerBuff(role, kind = "defend") {
  const playerCard = document.querySelector(`[data-player="${role}"]`);

  if (!playerCard) {
    return Promise.resolve();
  }

  const classMap = {
    energize: "is-receiving-energy",
    defend: "is-receiving-shield",
    heal: "is-receiving-heal",
    buff: "is-gaining-status",
    debuff: "is-losing-status",
    cleanse: "is-losing-status",
  };
  const durationMap = {
    energize: 500,
    defend: 460,
    heal: 500,
    buff: 480,
    debuff: 480,
    cleanse: 420,
  };
  const feedbackClass = classMap[kind] || classMap.defend;
  const duration = durationMap[kind] || durationMap.defend;

  playerCard.classList.remove(
    "is-taking-hit",
    "is-receiving-shield",
    "is-receiving-energy",
    "is-receiving-heal",
    "is-gaining-status",
    "is-losing-status"
  );
  playerCard.getBoundingClientRect();
  playerCard.classList.add(feedbackClass);

  return new Promise((resolve) => {
    window.setTimeout(() => {
      playerCard.classList.remove(feedbackClass);
      resolve();
    }, duration);
  });
}

function getStateEventDisplay(event) {
  if (!event) {
    return null;
  }

  if (event.type === "damage") {
    return {
      className: "damage",
      text: `-${event.amount}`,
    };
  }

  if (event.type === "shield") {
    return {
      className: "shield",
      text: `护盾+${event.amount}`,
    };
  }

  if (event.type === "energy") {
    return {
      className: "energy",
      text: `回能+${event.amount}`,
    };
  }

  if (event.type === "heal") {
    return {
      className: "heal",
      text: `治疗+${event.amount}`,
    };
  }

  if (event.type === "buff") {
    return {
      className: "buff",
      text: `${event.label}+${event.amount}`,
    };
  }

  if (event.type === "debuff") {
    return {
      className: "debuff",
      text: `${event.label}+${event.amount}`,
    };
  }

  if (event.type === "cleanse") {
    return {
      className: "cleanse",
      text: `净化-${event.amount}`,
    };
  }

  return null;
}

function getStateEventTargetElement(role, eventType) {
  const playerCard = document.querySelector(`[data-player="${role}"]`);

  if (!playerCard) {
    return null;
  }

  if (eventType === "damage") {
    return playerCard.querySelector('[data-bar-root="hp"]') || playerCard;
  }

  if (eventType === "shield") {
    return playerCard.querySelector('[data-bar-root="shield"]') || playerCard;
  }

  if (eventType === "energy") {
    return playerCard.querySelector('[data-bar-root="ep"]') || playerCard;
  }

  if (eventType === "heal") {
    return playerCard.querySelector('[data-bar-root="hp"]') || playerCard;
  }

  if (eventType === "buff" || eventType === "debuff" || eventType === "cleanse") {
    return playerCard.querySelector("[data-player-statuses]") || playerCard;
  }

  return playerCard;
}

function buildStatusMap(statuses = []) {
  return new Map((statuses || []).map((status) => [status.key, status]));
}

function getPlayerStatusChangeEvents(previousStatuses = [], nextStatuses = []) {
  const previousMap = buildStatusMap(previousStatuses);
  const nextMap = buildStatusMap(nextStatuses);
  const events = [];

  nextMap.forEach((nextStatus, statusKey) => {
    const previousStatus = previousMap.get(statusKey);
    const deltaStacks = (nextStatus.stacks ?? 0) - (previousStatus?.stacks ?? 0);

    if (deltaStacks > 0) {
      events.push({
        type: nextStatus.kind === "debuff" ? "debuff" : "buff",
        amount: deltaStacks,
        label: nextStatus.label,
      });
    }
  });

  return events;
}

function getEffectFeedbackAdjustments(effect) {
  const adjustments = {};

  (effect?.resourceConversions ?? []).forEach((conversion) => {
    if (conversion.resource !== "shield" || conversion.spent <= 0) {
      return;
    }

    const role = conversion.sourceRole;
    adjustments[role] = adjustments[role] || { ignoreShieldLoss: 0 };
    adjustments[role].ignoreShieldLoss += conversion.spent;
  });

  return adjustments;
}

function getPlayerStateChangeEvents(previousPlayer, nextPlayer, options = {}) {
  if (!previousPlayer || !nextPlayer) {
    return [];
  }

  const previousHp = Number(previousPlayer.hp) || 0;
  const nextHp = Number(nextPlayer.hp) || 0;
  const previousShield = Number(previousPlayer.shield) || 0;
  const nextShield = Number(nextPlayer.shield) || 0;
  const previousEp = Number(previousPlayer.ep) || 0;
  const nextEp = Number(nextPlayer.ep) || 0;
  const ignoredShieldLoss = Math.max(0, Number(options.ignoreShieldLoss) || 0);
  const hpLoss = Math.max(0, previousHp - nextHp);
  const shieldLoss = Math.max(0, previousShield - nextShield - ignoredShieldLoss);
  const shieldGain = Math.max(0, nextShield - previousShield);
  const energyGain = Math.max(0, nextEp - previousEp);
  const healGain = Math.max(0, nextHp - previousHp);
  const events = [];

  if (hpLoss + shieldLoss > 0) {
    events.push({
      type: "damage",
      amount: hpLoss + shieldLoss,
    });
  }

  if (shieldGain > 0) {
    events.push({
      type: "shield",
      amount: shieldGain,
    });
  }

  if (energyGain > 0) {
    events.push({
      type: "energy",
      amount: energyGain,
    });
  }

  if (healGain > 0) {
    events.push({
      type: "heal",
      amount: healGain,
    });
  }

  events.push(
    ...getPlayerStatusChangeEvents(previousPlayer.statuses ?? [], nextPlayer.statuses ?? [])
  );

  return events;
}

function getStateChangeTargetDescriptors(previousState, nextState, roles = ["self", "enemy"], options = {}) {
  const descriptors = [];
  const effectAdjustmentsByRole = options.effectAdjustmentsByRole || {};

  roles.forEach((role) => {
    const events = getPlayerStateChangeEvents(
      previousState?.players?.[role],
      nextState?.players?.[role],
      effectAdjustmentsByRole[role]
    );

    events.forEach((event) => {
      const targetElement = getStateEventTargetElement(role, event.type);

      if (!targetElement) {
        return;
      }

      descriptors.push({
        role,
        type: event.type,
        amount: event.amount,
        weight: Math.max(1, event.amount || 1),
        feedbackDelay: getParticleEffectProfile(event.type).feedbackDelay,
        element: targetElement,
        rect: targetElement.getBoundingClientRect(),
      });
    });
  });

  return descriptors;
}

function animatePlayerFloat(role, event) {
  const playerCard = document.querySelector(`[data-player="${role}"]`);
  const display = getStateEventDisplay(event);

  if (!playerCard || !display || !gameScreen) {
    return Promise.resolve();
  }

  const gameRect = gameScreen.getBoundingClientRect();
  const playerRect = playerCard.getBoundingClientRect();
  const floatNode = document.createElement("span");
  const anchorX = playerRect.left - gameRect.left + playerRect.width / 2;
  const anchorY =
    role === "enemy"
      ? playerRect.bottom - gameRect.top + 10
      : playerRect.top - gameRect.top - 18;

  floatNode.className = `player-float ${display.className} ${role}`;
  floatNode.textContent = display.text;
  floatNode.style.setProperty("--float-x", `${anchorX}px`);
  floatNode.style.setProperty("--float-y", `${anchorY}px`);
  gameScreen.appendChild(floatNode);

  return new Promise((resolve) => {
    window.setTimeout(() => {
      floatNode.remove();
      resolve();
    }, 820);
  });
}

async function animateRoleStateChangeFeedback(role, previousPlayer, nextPlayer, options = {}) {
  const { targetDescriptors = [] } = options;
  const effectAdjustmentsByRole = options.effectAdjustmentsByRole || {};
  const events = getPlayerStateChangeEvents(previousPlayer, nextPlayer, effectAdjustmentsByRole[role]);

  for (const event of events) {
    const feedbackDelay =
      targetDescriptors.find((descriptor) => descriptor.role === role && descriptor.type === event.type)
        ?.feedbackDelay || 0;

    if (feedbackDelay > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, feedbackDelay));
    }

    if (event.type === "damage") {
      await Promise.all([animatePlayerHit(role), animatePlayerFloat(role, event)]);
      continue;
    }

    if (event.type === "shield") {
      await Promise.all([animatePlayerBuff(role, "defend"), animatePlayerFloat(role, event)]);
      continue;
    }

    if (event.type === "energy") {
      await Promise.all([animatePlayerBuff(role, "energize"), animatePlayerFloat(role, event)]);
      continue;
    }

    if (event.type === "heal") {
      await Promise.all([animatePlayerBuff(role, "heal"), animatePlayerFloat(role, event)]);
      continue;
    }

    if (event.type === "buff" || event.type === "debuff" || event.type === "cleanse") {
      await Promise.all([animatePlayerBuff(role, event.type), animatePlayerFloat(role, event)]);
    }
  }
}

function animateStateChangeFeedback(previousState, nextState, roles = ["self", "enemy"], options = {}) {
  const animations = roles.map((role) =>
    animateRoleStateChangeFeedback(
      role,
      previousState?.players?.[role],
      nextState?.players?.[role],
      options
    )
  );

  return Promise.all(animations);
}

function addCardToHandState(state, role, card) {
  const player = state?.players?.[role];

  if (!player || !card) {
    return;
  }

  player.hand.push(structuredClone(card));
  player.handCount = player.hand.length;
  player.deckSize = Math.max(0, player.deckSize - 1);
}

function removeCardFromHandState(state, role, cardId, options = {}) {
  const player = state?.players?.[role];
  const { discard = false } = options;

  if (!player) {
    return null;
  }

  const index = player.hand.findIndex((card) => card.id === cardId);

  if (index < 0) {
    return null;
  }

  const [removedCard] = player.hand.splice(index, 1);
  player.handCount = player.hand.length;

  if (discard) {
    player.discardCount += 1;
  }

  return removedCard;
}

async function animateHandDiscards(role, stagedState, discardEntries = []) {
  if (!discardEntries.length) {
    return stagedState;
  }

  let nextStagedState = structuredClone(stagedState);

  for (const discard of discardEntries) {
    const cardId = discard?.cardId;
    const handRoot = document.querySelector(`[data-hand="${role}"]`);
    const cardNode =
      handRoot?.querySelector(`[data-card-id="${cardId}"]`) || handRoot?.querySelector(".hand-card");
    const discardedState = structuredClone(nextStagedState);
    const removedCard = removeCardFromHandState(discardedState, role, cardId, { discard: true });

    if (!removedCard) {
      continue;
    }

    if (!cardNode) {
      nextStagedState = discardedState;
      currentBattleState = nextStagedState;
      updatePlayer(role, nextStagedState.players[role]);
      continue;
    }

    const shatterAnimation = animateCardShatterToDiscard(cardNode, {
      targetRole: role,
    });

    await Promise.all([
      shatterAnimation,
      animateHandReflow(
        role,
        nextStagedState?.players?.[role]?.hand ?? [],
        discardedState.players[role].hand,
        shatterAnimation.totalDuration
      ),
    ]);

    nextStagedState = discardedState;
    currentBattleState = nextStagedState;
    updatePlayer(role, nextStagedState.players[role]);
  }

  return nextStagedState;
}

function mergePlayerSnapshot(baseState, playerSnapshot = {}) {
  const nextState = structuredClone(baseState);

  if (playerSnapshot.self) {
    nextState.players.self = structuredClone(playerSnapshot.self);
  }

  if (playerSnapshot.enemy) {
    nextState.players.enemy = structuredClone(playerSnapshot.enemy);
  }

  return nextState;
}

async function animateStateDelta(previousState, nextState, roles = ["self", "enemy"]) {
  const targetDescriptors = getStateChangeTargetDescriptors(previousState, nextState, roles);

  updatePlayer("enemy", nextState.players.enemy);
  updatePlayer("self", nextState.players.self, { renderHandCards: false });
  await animateStateChangeFeedback(previousState, nextState, roles, { targetDescriptors });
}

async function animateEnemyPlay(previousState, nextState, play) {
  const handRoot = document.querySelector('[data-hand="enemy"]');
  const sourceCard =
    handRoot?.querySelector(`[data-card-id="${play?.cardId}"]`) ||
    handRoot?.querySelector(".hand-card");
  const sourcePile = sourceCard || document.querySelector('[data-player="enemy"] [data-player-deck-stack]');
  const effectAdjustmentsByRole = getEffectFeedbackAdjustments(play?.effect);
  const targetDescriptors = getStateChangeTargetDescriptors(previousState, nextState, ["self", "enemy"], {
    effectAdjustmentsByRole,
  });

  if (!gameScreen || !play?.card || !sourcePile) {
    updatePlayer("enemy", nextState.players.enemy);
    updatePlayer("self", nextState.players.self, { renderHandCards: false });
    await animateStateChangeFeedback(previousState, nextState, ["self", "enemy"], { targetDescriptors });
    return;
  }

  const gameRect = gameScreen.getBoundingClientRect();
  const sourceRect = sourcePile.getBoundingClientRect();
  const targetCard = createHandCardElement(play.card, "self", getHandLayout(1, 0, "self"));
  const targetX = gameRect.left + gameRect.width / 2 - sourceRect.left - sourceRect.width / 2;
  const targetY = gameRect.top + gameRect.height / 2 - sourceRect.top - sourceRect.height / 2;
  const reflowDuration = 760;

  targetCard.classList.add("draw-flight-card");
  targetCard.setAttribute("aria-hidden", "true");
  targetCard.style.left = `${sourceRect.left - gameRect.left}px`;
  targetCard.style.top = `${sourceRect.top - gameRect.top}px`;
  targetCard.style.opacity = "0";
  targetCard.style.transform = "translate3d(0px, 0px, 0) rotate(-10deg) scale(0.7) rotateY(-88deg)";

  if (sourceCard) {
    sourceCard.style.visibility = "hidden";
  }

  gameScreen.appendChild(targetCard);
  const reflowAnimation = animateHandReflow(
    "enemy",
    previousState?.players?.enemy?.hand ?? [],
    nextState?.players?.enemy?.hand ?? [],
    reflowDuration
  );
  gameScreen.getBoundingClientRect();
  await waitForNextFrame();

  await new Promise((resolve) => {
    const totalDuration = 560;
    const holdStart = 0.66;
    const start = performance.now();
    let hitTriggered = false;

    function frame(now) {
      const progress = clamp01((now - start) / totalDuration);
      let tx = 0;
      let ty = 0;
      let scale = 0.7;
      let rotate = -10;
      let flip = -88;
      let opacity = 1;

      if (progress <= holdStart) {
        const t = easeInOutCubic(getSegmentProgress(progress, 0, holdStart));
        const arcLift = Math.sin(t * Math.PI) * 18;

        tx = lerp(0, targetX, t);
        ty = lerp(0, targetY, t) - arcLift;
        scale = lerp(0.7, 1.12, easeOutCubic(t));
        rotate = lerp(-10, 0, t);
        flip = lerp(-88, 0, easeOutCubic(t));
      } else {
        const t = easeInOutCubic(getSegmentProgress(progress, holdStart, 1));

        tx = targetX;
        ty = targetY;
        scale = lerp(1.12, 1.06, t);
        rotate = 0;
        flip = 0;
        opacity = lerp(1, 0.96, t);
      }

      targetCard.style.opacity = String(opacity);
      targetCard.style.transform =
        `translate3d(${tx}px, ${ty}px, 0) rotate(${rotate}deg) scale(${scale}) rotateY(${flip}deg)`;

      if (!hitTriggered && progress >= holdStart) {
        hitTriggered = true;
        updatePlayer("enemy", nextState.players.enemy);
        updatePlayer("self", nextState.players.self, { renderHandCards: false });
      }

      if (progress < 1) {
        requestAnimationFrame(frame);
        return;
      }

      resolve();
    }

    requestAnimationFrame(frame);
  });

  const feedbackAnimation = animateStateChangeFeedback(previousState, nextState, ["self", "enemy"], {
    targetDescriptors,
    effectAdjustmentsByRole,
  });

  await Promise.all([
    animateCardShatterToDiscard(targetCard, {
      targetRole: "enemy",
      hideCardFirst: true,
      targetDescriptors,
    }),
    reflowAnimation,
    feedbackAnimation,
  ]);
  targetCard.remove();
  updatePlayer("enemy", nextState.players.enemy);
}

async function animateEnemyTurn(previousState, nextState) {
  const enemyTurn = nextState?.lastAction?.enemyTurn;

  if (!enemyTurn) {
    renderBattleState(nextState);
    return;
  }

  let stagedState = structuredClone(previousState);
  const selfDiscards = nextState?.lastAction?.selfDiscard?.cards ?? [];
  const enemyDiscards = nextState?.lastAction?.enemyDiscard?.cards ?? [];
  const selfDraws = nextState?.lastAction?.selfDraw?.cards ?? [];
  const selfEndPhase = nextState?.lastAction?.selfEndPhase ?? null;
  const enemyEndPhase = nextState?.lastAction?.enemyEndPhase ?? null;
  const selfStartPhase = nextState?.lastAction?.selfStartPhase ?? null;

  if (selfDiscards.length) {
    setBattleStatus(`${stagedState.players.self.name}随机弃置${selfDiscards.length}张手牌`, "info");
    stagedState = await animateHandDiscards("self", stagedState, selfDiscards);
    await new Promise((resolve) => window.setTimeout(resolve, 180));
  }

  if (selfEndPhase?.state) {
    if (selfEndPhase.summary) {
      setBattleStatus(selfEndPhase.summary, "info");
    }
    const selfEndState = mergePlayerSnapshot(stagedState, selfEndPhase.state);
    await animateStateDelta(stagedState, selfEndState);
    stagedState = selfEndState;
    currentBattleState = stagedState;
    await new Promise((resolve) => window.setTimeout(resolve, 180));
  }

  stagedState.currentTurn = "enemy";
  stagedState.players.self.ep = 0;
  stagedState.players.enemy.maxEp = nextState.players.enemy.maxEp;
  stagedState.players.enemy.ep = nextState.players.enemy.maxEp;
  stagedState.players.enemy.shield = 0;
  renderBattleState(stagedState);
  setBattleStatus("对手回合中", "info");

  const enemyDraws = enemyTurn.draws ?? (enemyTurn.draw?.card ? [enemyTurn.draw] : []);

  for (const draw of enemyDraws) {
    if (!draw?.card) {
      continue;
    }

    const enemyDrawState = structuredClone(stagedState);
    addCardToHandState(enemyDrawState, "enemy", draw.card);
    await animateDrawToHand("enemy", stagedState, enemyDrawState);
    stagedState = enemyDrawState;
    currentBattleState = stagedState;
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }

  for (const play of enemyTurn.plays ?? []) {
    let enemyPlayState = structuredClone(stagedState);

    if (play.stateAfter) {
      enemyPlayState = mergePlayerSnapshot(enemyPlayState, play.stateAfter);
    } else {
      removeCardFromHandState(enemyPlayState, "enemy", play.cardId, { discard: true });

      enemyPlayState.players.enemy.ep = Math.max(
        0,
        enemyPlayState.players.enemy.ep - (play.card?.cost ?? 0) + (play.effect?.energyGain ?? 0)
      );

      if ((play.effect?.dealtDamage ?? 0) > 0 || (play.effect?.blockedDamage ?? 0) > 0) {
        enemyPlayState.players.self.shield = Math.max(
          0,
          (enemyPlayState.players.self.shield || 0) - (play.effect?.blockedDamage ?? 0)
        );
        enemyPlayState.players.self.hp = Math.max(
          0,
          enemyPlayState.players.self.hp - (play.effect?.dealtDamage ?? 0)
        );
      }

      if ((play.effect?.block ?? 0) > 0) {
        enemyPlayState.players.enemy.shield =
          (enemyPlayState.players.enemy.shield || 0) + (play.effect?.block ?? 0);
      }
    }

    await animateEnemyPlay(stagedState, enemyPlayState, play);
    stagedState = enemyPlayState;
    currentBattleState = stagedState;
  }

  if (enemyEndPhase?.state) {
    if (enemyEndPhase.summary) {
      setBattleStatus(enemyEndPhase.summary, "info");
    }
    const enemyEndState = mergePlayerSnapshot(stagedState, enemyEndPhase.state);
    await animateStateDelta(stagedState, enemyEndState);
    stagedState = enemyEndState;
    currentBattleState = stagedState;
    await new Promise((resolve) => window.setTimeout(resolve, 180));
  }

  if (enemyDiscards.length) {
    setBattleStatus(`${stagedState.players.enemy.name}随机弃置${enemyDiscards.length}张手牌`, "info");
    stagedState = await animateHandDiscards("enemy", stagedState, enemyDiscards);
    await new Promise((resolve) => window.setTimeout(resolve, 180));
  }

  if (selfStartPhase?.state) {
    if (selfStartPhase.summary) {
      setBattleStatus(selfStartPhase.summary, "info");
    }
    let selfStartState = mergePlayerSnapshot(stagedState, selfStartPhase.state);
    selfStartState.currentTurn = "self";
    selfStartState.turn = nextState.turn;
    await animateStateDelta(stagedState, selfStartState);
    stagedState = selfStartState;
    currentBattleState = stagedState;
    await new Promise((resolve) => window.setTimeout(resolve, 180));
  }

  if (selfDraws.length) {
    let beforeSelfDrawState = selfStartPhase?.state
      ? (() => {
          const initialState = mergePlayerSnapshot(stagedState, selfStartPhase.state);
          initialState.currentTurn = "self";
          initialState.turn = nextState.turn;
          return initialState;
        })()
      : structuredClone(nextState);

    if (!selfStartPhase?.state) {
      [...selfDraws].reverse().forEach((draw) => {
        removeCardFromHandState(beforeSelfDrawState, "self", draw.cardId);
        beforeSelfDrawState.players.self.deckSize += 1;
      });
    }

    renderBattleState(beforeSelfDrawState);

    for (const draw of selfDraws) {
      if (!draw?.card) {
        continue;
      }

      const selfDrawState = structuredClone(beforeSelfDrawState);
      addCardToHandState(selfDrawState, "self", draw.card);
      await animateDrawToHand("self", beforeSelfDrawState, selfDrawState);
      beforeSelfDrawState = selfDrawState;
    }

    return;
  }

  renderBattleState(nextState);
}

function beginCardDrag(event, card) {
  event.preventDefault();

  dragState = {
    pointerId: event.pointerId,
    card,
    cardId: card.dataset.cardId,
    startX: event.clientX,
    startY: event.clientY,
  };

  card.classList.add("is-dragging");
  setActiveHandCard(selfHandRoot, card);
  card.setPointerCapture(event.pointerId);
}

function hasCrossedPlayMidline(pointerY) {
  if (!gameScreen) {
    return pointerY <= window.innerHeight / 2;
  }

  const screenRect = gameScreen.getBoundingClientRect();
  const midlineY = screenRect.top + screenRect.height / 2;
  return pointerY <= midlineY;
}

function updateCardDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) {
    return;
  }

  event.preventDefault();

  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;

  dragState.card.style.setProperty("--drag-x", `${dx}px`);
  dragState.card.style.setProperty("--drag-y", `${dy}px`);
  dragState.card.classList.toggle("is-armed", hasCrossedPlayMidline(event.clientY));
}

async function finishCardDrag(event) {
  if (isResolvingAction || !dragState || event.pointerId !== dragState.pointerId) {
    return;
  }

  event.preventDefault();

  const { card, cardId } = dragState;

  dragState = null;

  if (card.hasPointerCapture(event.pointerId)) {
    card.releasePointerCapture(event.pointerId);
  }

  if (hasCrossedPlayMidline(event.clientY)) {
    try {
      isResolvingAction = true;
      setActionButtonsDisabled(true);
      const previousState = currentBattleState;

      const state = await postBattleCommand("/api/battle-action", {
        type: "play-card",
        actorId: "self",
        targetId: "enemy",
        cardId,
      });
      updatePlayer("enemy", state.players.enemy);
      updatePlayer("self", state.players.self, { renderHandCards: false });
      updateBattleStatus(state);
      currentBattleState = state;
      const effectAdjustmentsByRole = getEffectFeedbackAdjustments(state?.lastAction?.effect);
      const targetDescriptors = getStateChangeTargetDescriptors(previousState, state, ["self", "enemy"], {
        effectAdjustmentsByRole,
      });
      const shatterAnimation = animateCardShatterToDiscard(card, {
        targetRole: "self",
        targetDescriptors,
      });
      const feedbackAnimation = animateStateChangeFeedback(previousState, state, ["self", "enemy"], {
        targetDescriptors,
        effectAdjustmentsByRole,
      });
      await Promise.all([
        shatterAnimation,
        feedbackAnimation,
        animateHandReflow(
          "self",
          previousState?.players?.self?.hand ?? [],
          state.players.self.hand,
          shatterAnimation.totalDuration
        ),
      ]);
      clearActiveHandCard(selfHandRoot);
      return;
    } catch (error) {
      await animateCardReturnToHand(card);
      clearActiveHandCard(selfHandRoot);
      setBattleStatus(error.message, "error");
      return;
    } finally {
      isResolvingAction = false;
      setActionButtonsDisabled(false);
    }
  }

  await animateCardReturnToHand(card);
  clearActiveHandCard(selfHandRoot);
}

function renderHand(role, hand = []) {
  const handRoot = document.querySelector(`[data-hand="${role}"]`);

  if (!handRoot) {
    return;
  }

  const count = hand.length;
  const overlap = getHandOverlap(count);

  handRoot.style.setProperty("--card-overlap", `${overlap}px`);
  handRoot.innerHTML = hand
    .map((card, index) => createHandCardMarkup(card, role, getHandLayout(count, index, role)))
    .join("");
}

function applyHandCardLayoutStyles(card, layout) {
  card.style.setProperty("--card-angle", `${layout.angle}deg`);
  card.style.setProperty("--card-offset-y", `${layout.offsetY}px`);
  card.style.setProperty("--card-z-index", String(layout.zIndex));
}

function patchHand(role, hand = [], injectedNodes = new Map()) {
  const handRoot = document.querySelector(`[data-hand="${role}"]`);

  if (!handRoot) {
    return;
  }

  const count = hand.length;
  const overlap = getHandOverlap(count);
  const existingNodes = new Map(
    Array.from(handRoot.querySelectorAll(".hand-card")).map((card) => [card.dataset.cardId, card])
  );

  injectedNodes.forEach((node, cardId) => {
    existingNodes.set(cardId, node);
  });

  handRoot.style.setProperty("--card-overlap", `${overlap}px`);

  const orderedNodes = hand.map((card, index) => {
    const layout = getHandLayout(count, index, role);
    const existingCard = existingNodes.get(card.id);

    if (existingCard) {
      applyHandCardLayoutStyles(existingCard, layout);
      existingCard.classList.remove("is-active", "is-dragging", "is-armed", "is-shattering");
      existingCard.style.removeProperty("--drag-x");
      existingCard.style.removeProperty("--drag-y");
      clearFlipStyles(existingCard);
      return existingCard;
    }

    return createHandCardElement(card, role, layout);
  });

  handRoot.replaceChildren(...orderedNodes);
}

async function animateHandReflow(role, previousHand = [], nextHand = [], duration = 260) {
  const handRoot = document.querySelector(`[data-hand="${role}"]`);

  if (!handRoot) {
    return;
  }

  const firstRects = captureHandCardRects(role);
  const previousLayoutMap = buildHandLayoutMap(previousHand, role);
  const nextLayoutMap = buildHandLayoutMap(nextHand, role);

  patchHand(role, nextHand);

  const sharedCards = Array.from(handRoot.querySelectorAll(".hand-card"))
    .map((card) => {
      const cardId = card.dataset.cardId;
      const firstRect = firstRects.get(cardId);

      if (!firstRect) {
        return null;
      }

      const finalRect = card.getBoundingClientRect();
      const previousLayout = previousLayoutMap.get(cardId)?.layout;
      const nextLayout = nextLayoutMap.get(cardId)?.layout;

      return {
        card,
        dx: firstRect.left - finalRect.left,
        dy: firstRect.top - finalRect.top,
        rotate: (previousLayout?.angle ?? 0) - (nextLayout?.angle ?? 0),
      };
    })
    .filter(Boolean);

  if (!sharedCards.length) {
    return;
  }

  sharedCards.forEach(({ card, dx, dy, rotate }) => {
    card.style.transition = "none";
    card.style.setProperty("--flip-x", `${dx}px`);
    card.style.setProperty("--flip-y", `${dy}px`);
    card.style.setProperty("--flip-rotate", `${rotate}deg`);
  });

  handRoot.getBoundingClientRect();
  await waitForNextFrame();

  sharedCards.forEach(({ card }) => {
    card.style.transition = `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    card.style.setProperty("--flip-x", "0px");
    card.style.setProperty("--flip-y", "0px");
    card.style.setProperty("--flip-rotate", "0deg");
  });

  await new Promise((resolve) => window.setTimeout(resolve, duration));

  sharedCards.forEach(({ card }) => clearFlipStyles(card));
}

function finalizeAnimatedDrawHand(role, hand = [], drawnCardNode) {
  const handRoot = document.querySelector(`[data-hand="${role}"]`);

  if (!handRoot || !drawnCardNode) {
    return;
  }

  const count = hand.length;
  const overlap = getHandOverlap(count);
  const existingNodes = new Map(
    Array.from(handRoot.querySelectorAll(".hand-card")).map((card) => [card.dataset.cardId, card])
  );

  handRoot.style.setProperty("--card-overlap", `${overlap}px`);

  const orderedNodes = hand.map((card, index) => {
    if (card.id === drawnCardNode.dataset.cardId) {
      return drawnCardNode;
    }

    return existingNodes.get(card.id) || createHandCardElement(card, role, getHandLayout(count, index, role));
  });

  drawnCardNode.style.visibility = "hidden";
  handRoot.replaceChildren(...orderedNodes);

  orderedNodes.forEach((node, index) => {
    const layout = getHandLayout(count, index, role);

    node.style.transition = "none";
    applyHandCardLayoutStyles(node, layout);
    node.classList.remove("is-active", "is-dragging", "is-armed", "is-shattering", "draw-flight-card");
    node.style.removeProperty("--drag-x");
    node.style.removeProperty("--drag-y");
    node.style.removeProperty("left");
    node.style.removeProperty("top");
    node.style.removeProperty("margin");
    node.style.removeProperty("pointer-events");
    node.style.removeProperty("transform-origin");
    node.style.removeProperty("z-index");
    node.style.removeProperty("box-shadow");
    node.style.removeProperty("will-change");
    node.style.removeProperty("contain");
    node.style.removeProperty("transform");
    node.style.removeProperty("opacity");
    clearFlipStyles(node, { removeTransition: false });
  });

  handRoot.getBoundingClientRect();
  drawnCardNode.style.removeProperty("visibility");
  orderedNodes.forEach((node) => {
    node.style.removeProperty("transition");
  });
}

function updateBar(barRoot, current, max) {
  const fill = barRoot.querySelector("[data-bar-fill]");
  const text = barRoot.querySelector("[data-bar-text]");
  const safeMax = Number(max) > 0 ? Number(max) : 1;
  const numericCurrent = Number(current) || 0;
  const safeCurrent = Math.max(0, numericCurrent);
  const fillCurrent = Math.min(safeCurrent, safeMax);
  const percent = (fillCurrent / safeMax) * 100;

  fill.style.width = `${percent}%`;
  fill.dataset.current = String(safeCurrent);
  fill.dataset.max = String(safeMax);
  text.textContent = `${safeCurrent} / ${safeMax}`;
}

function updateShieldBar(barRoot, value) {
  const fill = barRoot.querySelector("[data-bar-fill]");
  const text = barRoot.querySelector("[data-bar-text]");
  const shieldValue = Math.max(0, Number(value) || 0);
  const percent = shieldValue > 0 ? 100 : 0;

  fill.style.width = `${percent}%`;
  fill.dataset.current = String(shieldValue);
  fill.dataset.max = "1";
  text.textContent = String(shieldValue);
}

function updatePlayer(role, playerState, options = {}) {
  const card = document.querySelector(`[data-player="${role}"]`);

  if (!card || !playerState) {
    return;
  }

  const { renderHandCards = true } = options;

  const nameNode = card.querySelector("[data-player-name]");
  const archetypeNode = card.querySelector("[data-player-archetype]");
  const avatarNode = card.querySelector("[data-player-avatar]");
  const deckNode = card.querySelector("[data-player-deck]");
  const deckStackNode = card.querySelector("[data-player-deck-stack]");
  const discardNode = card.querySelector("[data-player-discard]");
  const discardStackNode = card.querySelector("[data-player-discard-stack]");
  const handNode = card.querySelector("[data-player-hand]");
  const statusStripNode = card.querySelector("[data-player-statuses]");
  const shieldBar = card.querySelector('[data-bar-root="shield"]');
  const hpBar = card.querySelector('[data-bar-root="hp"]');
  const epBar = card.querySelector('[data-bar-root="ep"]');
  const maxDeckSize = 30;
  const deckDepth = Math.max(3, Math.round((playerState.deckSize / maxDeckSize) * 12));
  const discardDepth = Math.max(2, Math.round((playerState.discardCount / maxDeckSize) * 12));

  nameNode.textContent = playerState.name;
  if (archetypeNode) {
    archetypeNode.textContent = playerState.deckArchetype?.label || "通用流";
    archetypeNode.title = playerState.deckArchetype?.description || "";
  }
  avatarNode.textContent = playerState.avatar;
  deckNode.textContent = String(playerState.deckSize);
  deckStackNode.style.setProperty("--deck-depth", String(deckDepth));
  discardNode.textContent = String(playerState.discardCount);
  discardStackNode.style.setProperty("--deck-depth", String(discardDepth));
  handNode.textContent = String(playerState.hand?.length ?? playerState.handCount);
  renderStatusStrip(statusStripNode, role, playerState.statuses ?? []);
  if (shieldBar) {
    updateShieldBar(shieldBar, playerState.shield ?? 0);
  }
  if (renderHandCards) {
    renderHand(role, playerState.hand);
  }
  updateBar(hpBar, playerState.hp, playerState.maxHp);
  updateBar(epBar, playerState.ep, playerState.maxEp);
}

function updateBattleStatus(state) {
  updateTurnIndicator(state);
  updateEnemyIntent(state);

  if (state?.winner === "self") {
    setBattleStatus(state.lastAction?.summary || "对手被击败", "info");
    return;
  }

  if (state?.winner === "enemy") {
    setBattleStatus(state.lastAction?.summary || "我方被击败", "error");
    return;
  }

  if (!state?.lastAction) {
    setBattleStatus("卡牌对局准备中", "info");
    return;
  }

  setBattleStatus(state.lastAction.summary, "info");
}

async function fetchBattleState() {
  const response = await fetch("/api/battle-state", {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to load battle state");
  }

  return response.json();
}

async function fetchBattleConfig() {
  const response = await fetch("/api/battle-config", {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to load battle config");
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || "Failed to load battle config");
  }

  return data.config;
}

async function postBattleCommand(path, payload = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Battle request failed");
  }

  return data.state;
}

function renderBattleState(state) {
  hideStatusTooltip();
  currentBattleState = state;

  updatePlayer("enemy", state.players.enemy);
  updatePlayer("self", state.players.self);
  const activeCard = getCardById("self", activeSelfCardId);

  if (activeCard) {
    lastSelectedSelfCard = activeCard;
  } else if (activeSelfCardId && !getCardById("self", activeSelfCardId)) {
    activeSelfCardId = null;
  }

  if (selfHandRoot) {
    clearActiveHandCard(selfHandRoot);
  } else {
    renderCardDetail(lastSelectedSelfCard);
  }
  updateBattleStatus(state);
  syncActionButtonsAvailability();
}

if (gameScreen) {
  gameScreen.addEventListener("pointerdown", (event) => {
    const statusChip = event.target.closest("[data-status-chip]");

    if (!statusChip || !currentBattleState) {
      return;
    }
    showStatusTooltip(statusChip);
  });

  gameScreen.addEventListener("pointerup", () => {
    hideStatusTooltip();
  });

  gameScreen.addEventListener("pointercancel", () => {
    hideStatusTooltip();
  });

  gameScreen.addEventListener("pointerleave", () => {
    hideStatusTooltip();
  });
}

async function handleActionClick(event) {
  if (isResolvingAction) {
    return;
  }

  const actionType = event.currentTarget.dataset.action;
  const previousState = currentBattleState;

  try {
    isResolvingAction = true;
    setActionButtonsDisabled(true);

    let state;

    if (actionType === "end-turn") {
      state = await postBattleCommand("/api/battle-action", {
        type: "end-turn",
        actorId: "self",
      });
      setBattleStatus("对手回合中", "info");
      await animateEnemyTurn(previousState, state);
    } else if (actionType === "reset") {
      state = await postBattleCommand("/api/battle-reset", {
        selfArchetypeKey: selfArchetypeSelect?.value || null,
        enemyArchetypeKey: enemyArchetypeSelect?.value || null,
      });
      renderBattleState(state);
    } else {
      return;
    }
  } catch (error) {
    setBattleStatus(error.message, "error");
  } finally {
    isResolvingAction = false;
    setActionButtonsDisabled(false);
  }
}

async function loadBattleState() {
  try {
    if (!battleConfig) {
      battleConfig = await fetchBattleConfig();
      populateArchetypeSelect(selfArchetypeSelect, battleConfig.selfArchetypes);
      populateArchetypeSelect(enemyArchetypeSelect, battleConfig.enemyArchetypes);
    }

    const state = await fetchBattleState();
    renderBattleState(state);
  } catch (error) {
    setBattleStatus(error.message, "error");
  }
}

if (selfHandRoot) {
  selfHandRoot.addEventListener("pointerdown", (event) => {
    if (
      isResolvingAction ||
      !currentBattleState ||
      currentBattleState.currentTurn !== "self" ||
      currentBattleState.winner
    ) {
      return;
    }

    const card = event.target.closest(".hand-card");

    if (!card) {
      return;
    }

    beginCardDrag(event, card);
  });

  selfHandRoot.addEventListener("pointermove", (event) => {
    if (dragState) {
      updateCardDrag(event);
      return;
    }

    if (!currentBattleState || currentBattleState.currentTurn !== "self" || currentBattleState.winner) {
      clearActiveHandCard(selfHandRoot);
      return;
    }

    const card = event.target.closest(".hand-card");
    setActiveHandCard(selfHandRoot, card);
  });

  selfHandRoot.addEventListener("pointerleave", () => {
    if (dragState) {
      return;
    }

    clearActiveHandCard(selfHandRoot);
  });

  selfHandRoot.addEventListener("pointerup", async (event) => {
    await finishCardDrag(event);
  });

  selfHandRoot.addEventListener("pointercancel", async (event) => {
    await finishCardDrag(event);
  });
}

window.addEventListener("resize", () => {
  resetFxCanvas();
});

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

document.addEventListener("selectstart", (event) => {
  event.preventDefault();
});

document.addEventListener("dragstart", (event) => {
  event.preventDefault();
});

document.addEventListener("gesturestart", (event) => {
  event.preventDefault();
});

actionButtons.forEach((button) => {
  button.addEventListener("click", handleActionClick);
});

resetFxCanvas();
loadBattleState();
