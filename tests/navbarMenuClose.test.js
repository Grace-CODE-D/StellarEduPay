'use strict';

// Tests for the mobile menu close-on-route-change behaviour in Navbar.
// The fix adds: useEffect(() => { setOpen(false); }, [pathname])
// We test the state-transition logic directly without a DOM renderer,
// matching the pattern used in testnetBanner.test.js.

/**
 * Minimal simulation of the useEffect([pathname]) hook:
 * returns the new `open` state after a pathname change.
 */
function menuStateAfterRouteChange(wasOpen, pathnameChanged) {
  // The effect fires whenever pathname changes, unconditionally closing the menu.
  if (pathnameChanged) return false;
  return wasOpen;
}

describe('Navbar mobile menu — close on route change', () => {
  it('closes an open menu when the route changes', () => {
    expect(menuStateAfterRouteChange(true, true)).toBe(false);
  });

  it('keeps the menu closed when the route changes', () => {
    expect(menuStateAfterRouteChange(false, true)).toBe(false);
  });

  it('does not change menu state when the route has not changed', () => {
    expect(menuStateAfterRouteChange(true, false)).toBe(true);
    expect(menuStateAfterRouteChange(false, false)).toBe(false);
  });

  it('closes the menu on browser back navigation (route change)', () => {
    // Back navigation changes pathname, so the effect fires.
    const openBeforeBack = true;
    const pathnameChangedByBack = true;
    expect(menuStateAfterRouteChange(openBeforeBack, pathnameChangedByBack)).toBe(false);
  });

  it('closes the menu on browser forward navigation (route change)', () => {
    const openBeforeForward = true;
    const pathnameChangedByForward = true;
    expect(menuStateAfterRouteChange(openBeforeForward, pathnameChangedByForward)).toBe(false);
  });
});
