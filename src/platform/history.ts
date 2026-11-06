// platform/history.ts: back-gesture guard (TECH §10.1). On run start a history entry is pushed; a popstate during a
// run (Android back, iOS edge swipe) calls onBack('run') and pushes the entry again, so the page never leaves.
// On other screens popstate calls onBack('menu') (the app navigates to the Title).
export interface BackGuard { armRun(): void; disarm(): void; dispose(): void }

export function createBackGuard(onBack: (during: 'run' | 'menu') => void): BackGuard {
  let armed = false;
  let pushed = false;
  const onPop = () => {
    pushed = false;
    if (armed) { onBack('run'); push(); } else onBack('menu');
  };
  const push = () => { if (!pushed) { try { history.pushState({ run: true }, ''); pushed = true; } catch { /* sandboxed */ } } };
  window.addEventListener('popstate', onPop);
  return {
    armRun() { armed = true; push(); },
    disarm() { armed = false; },
    dispose() { window.removeEventListener('popstate', onPop); },
  };
}
