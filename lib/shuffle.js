// Picks one item at random out of a catalog, weighting the draw by rating so
// a "surprise me" click leans toward what's actually well-rated instead of a
// flat coin toss. Squaring the rating (instead of using it directly) makes
// that lean noticeably stronger: a 9 is ~5x more likely than a 4, not just
// twice as likely.
export function pickWeightedByRating(items) {
  const rated = items.filter((item) => Number(item.rating) > 0);
  const pool = rated.length > 0 ? rated : items;
  if (pool.length === 0) return null;

  const weights = pool.map((item) => {
    const rating = Number(item.rating) || 0;
    return rating > 0 ? rating * rating : 1;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);

  let roll = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}
