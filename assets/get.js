(() => {
  "use strict";

  const stores = document.querySelector(".store-links");
  if (!stores) return;

  const userAgent = navigator.userAgent || "";
  const appStore = stores.querySelector('[data-store="app_store"]');
  const googlePlay = stores.querySelector('[data-store="google_play"]');
  const isAppleMobile = /iPhone|iPad|iPod/i.test(userAgent);

  // Android and desktop traffic lead with Play. Apple mobile traffic leads with
  // the parked App Store control until that listing is available.
  if (isAppleMobile && appStore) stores.prepend(appStore);
  else if (googlePlay) stores.prepend(googlePlay);
})();
