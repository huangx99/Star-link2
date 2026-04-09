const CARD_TEMPLATES = [
  {
    key: "strike",
    name: "打击",
    cost: 1,
    type: "攻击",
    kind: "attack",
    damage: 5,
    summary: "5点伤害",
    description: "对敌方造成5点伤害",
    accent: "attack",
    artLabel: "斩击",
    art: null,
  },
  {
    key: "strike",
    name: "打击",
    cost: 1,
    type: "攻击",
    kind: "attack",
    damage: 5,
    summary: "5点伤害",
    description: "对敌方造成5点伤害",
    accent: "attack",
    artLabel: "斩击",
    art: null,
  },
  {
    key: "guard",
    name: "格挡",
    cost: 1,
    type: "防御",
    kind: "defend",
    block: 6,
    summary: "6点护盾",
    description: "获得6点护盾",
    accent: "defend",
    artLabel: "格挡",
    art: null,
  },
  {
    key: "charge",
    name: "回能",
    cost: 1,
    type: "回能",
    kind: "energize",
    energyGain: 2,
    summary: "回复2能量",
    description: "回复2点能量",
    accent: "energize",
    artLabel: "充能",
    art: null,
  },
];

function getCardTemplate(serial = 1) {
  const safeSerial = Math.max(1, Number(serial) || 1);
  return CARD_TEMPLATES[(safeSerial - 1) % CARD_TEMPLATES.length];
}

module.exports = {
  getCardTemplate,
};
