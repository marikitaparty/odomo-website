(() => {
  "use strict";

  const stores = document.querySelector(".store-links");
  if (!stores) return;

  const userAgent = navigator.userAgent || "";
  const appStore = stores.querySelector('[data-store="app_store"]');
  const googlePlay = stores.querySelector('[data-store="google_play"]');
  const isAndroid = /Android/i.test(userAgent);

  // Android traffic leads with Play. Everyone else leads with the App Store,
  // the only live listing; Play stays a parked control until its listing is
  // available.
  if (isAndroid && googlePlay) stores.prepend(googlePlay);
  else if (appStore) stores.prepend(appStore);
})();
