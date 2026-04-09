const PLAYER_MAX_HP = 30;
const PLAYER_MAX_EP = 3;
const PLAYER_MAX_EP_CAP = 10;
const PLAYER_DECK_SIZE = 30;
const PLAYER_HAND_SIZE = 5;
const TURN_END_HAND_LIMIT = 3;
const TURN_DRAW_CAP = 5;

const ACTION_TYPES = {
  BASIC_STRIKE: "basic-strike",
  DRAW_CARD: "draw-card",
  END_TURN: "end-turn",
  PLAY_CARD: "play-card",
};

module.exports = {
  ACTION_TYPES,
  PLAYER_DECK_SIZE,
  PLAYER_HAND_SIZE,
  PLAYER_MAX_EP,
  PLAYER_MAX_EP_CAP,
  PLAYER_MAX_HP,
  TURN_END_HAND_LIMIT,
  TURN_DRAW_CAP,
};
