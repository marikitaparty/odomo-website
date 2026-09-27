(() => {
  const toggle = document.getElementById("navToggle");
  const menu = document.getElementById("mobileNav");
  if (!toggle || !menu) return;
  toggle.hidden = false;
  const desktop = matchMedia("(min-width: 1024px)");
  function closeMenu(restoreFocus = false) {
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
    if (restoreFocus) toggle.focus();
  }
  toggle.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
  menu.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link) return;
    closeMenu();
    const target = document.querySelector(link.hash);
    if (target) {
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) closeMenu(true);
  });
  desktop.addEventListener("change", () => {
    const focusWasInMenu =
      menu.contains(document.activeElement) ||
      document.activeElement === toggle;
    closeMenu();
    if (desktop.matches && focusWasInMenu)
      document.querySelector(".header-row .brand").focus();
  });
})();

(() => {
  const hero = document.querySelector(".hero");
  const control = document.querySelector(".hero-motion-toggle");
  if (!hero || !control) return;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const syncPreference = () => {
    control.hidden = reducedMotion.matches;
  };
  syncPreference();
  reducedMotion.addEventListener("change", syncPreference);
  control.addEventListener("click", () => {
    const paused = hero.dataset.motionPaused !== "true";
    hero.dataset.motionPaused = String(paused);
    control.setAttribute("aria-pressed", String(paused));
    control.setAttribute(
      "aria-label",
      paused ? "Resume hero animation" : "Pause hero animation",
    );
  });
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(([entry]) => {
      hero.dataset.motionVisible = String(entry.isIntersecting);
    });
    observer.observe(hero);
  }
  const syncVisibility = () => {
    hero.dataset.documentHidden = String(document.hidden);
  };
  syncVisibility();
  document.addEventListener("visibilitychange", syncVisibility);
})();
