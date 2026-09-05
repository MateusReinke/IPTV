// Goes back to the previous in-app screen when there is history to return to.
// Plain router.push to a fixed URL was landing users back on a stale default
// (e.g. always the Live TV tab) instead of wherever they actually came from;
// router.back() replays the real history entry, tab/category state and all.
// Falls back to a fixed destination for pages opened directly (a shared link,
// a refresh), where there is no in-app history to go back to.
export function goBack(router, fallbackHref) {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back();
  } else {
    router.push(fallbackHref);
  }
}
