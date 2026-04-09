function discardRandomCardsToLimit(state, actorId, handLimit) {
  const actor = state.players[actorId];
  const normalizedLimit = Math.max(0, Number(handLimit) || 0);

  if (!actor) {
    throw new Error("Invalid discard actor");
  }

  const discardedCards = [];

  while (actor.hand.length > normalizedLimit) {
    const discardIndex = Math.floor(Math.random() * actor.hand.length);
    const [discardedCard] = actor.hand.splice(discardIndex, 1);

    if (!discardedCard) {
      break;
    }

    discardedCards.push(discardedCard);
    actor.discardCount += 1;
  }

  actor.handCount = actor.hand.length;

  return discardedCards;
}

module.exports = {
  discardRandomCardsToLimit,
};
