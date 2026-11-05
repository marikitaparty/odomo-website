// Odomo marketing site analytics (MKP-287).
//
// OpenPanel, self-hosted, cookieless: the tracker keeps its device id in memory
// only (nothing in cookies, localStorage or sessionStorage), and this file adds
// no storage of its own. The session-replay build is not vendored, so no replay
// can start.
//
// Nothing loads until assets/analytics-config.js sets a client id: without one
// the page stays completely inert, no SDK script is requested and no event is
// sent. Store links are still upgraded with campaign parameters, which needs no
// tracking.
(() => {
  "use strict";

  const SDK_SRC = "assets/op1.js";
  const SDK_VERSION = "1.4.3";
  const DEFAULT_API_URL = "https://events.marikita.party/api";
  const UTM_KEYS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ];
  const MAX_UTM_LENGTH = 120;
  // Free-form values can contain names or other personal data. Add only
  // reviewed campaign vocabulary; utm_term is intentionally never forwarded.
  const SAFE_UTM_VALUES = {
    utm_source: new Set(["meta", "newsletter"]),
    utm_medium: new Set(["email"]),
    utm_campaign: new Set(["launch"]),
    utm_content: new Set(["hero"]),
    utm_term: new Set(),
  };

  /** Retain only approved campaign labels; unknown and free-text values are dropped. */
  function readUtmValue(key, raw) {
    if (typeof raw !== "string") return "";
    const value = raw
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, MAX_UTM_LENGTH)
      .toLowerCase();
    return SAFE_UTM_VALUES[key].has(value) ? value : "";
  }

  /** The utm_* parameters on the current URL, shaped as event properties. */
  function readCampaign(search) {
    const params = new URLSearchParams(search);
    const campaign = {};
    for (const key of UTM_KEYS) {
      const value = readUtmValue(key, params.get(key));
      if (value) campaign[key] = value;
    }
    return campaign;
  }
  /** Keep untrusted query keys out of the SDK's automatic page URL. */
  function retainCampaignInLocation(campaign) {
    const campaignQuery = new URLSearchParams(campaign).toString();
    const pagePath = window.location.pathname;
    const hash = window.location.hash;
    const safeUrl = campaignQuery
      ? `${pagePath}?${campaignQuery}${hash}`
      : `${pagePath}${hash}`;
    const currentUrl = `${pagePath}${window.location.search}${hash}`;
    if (safeUrl !== currentUrl) {
      window.history.replaceState(window.history.state, "", safeUrl);
    }
  }

  /** `href` with the campaign appended, so the store listing carries it too. */
  function appendCampaign(href, campaign) {
    let url;
    try {
      url = new URL(href, window.location.href);
    } catch {
      return "";
    }
    const entries = Object.entries(campaign);
    for (const [key, value] of entries) url.searchParams.set(key, value);
    // Google Play hands `referrer` to the app as the Play Install Referrer,
    // which is where the app reads utm_* from after an install (MKP-288).
    // The App Store has no equivalent for organic links.
    if (entries.length > 0 && url.hostname === "play.google.com") {
      url.searchParams.set("referrer", new URLSearchParams(campaign).toString());
    }
    return url.toString();
  }

  /** Queue-aware track call, matching the OpenPanel script-tag contract. */
  function track(name, properties) {
    if (typeof window.op !== "function") return;
    window.op("track", name, properties);
  }

  /**
   * Store buttons start inert ("Listing pending"): without a data-store-url
   * they stay unfocusable and unclickable-as-links. Once the listing exists the
   * URL is set in the markup and this turns the element into a real outbound
   * link carrying the campaign.
   */
  function upgradeStoreLinks(campaign) {
    for (const link of document.querySelectorAll("[data-store]")) {
      const base = link.getAttribute("data-store-url") || "";
      const href = base ? appendCampaign(base, campaign) : "";
      if (!href) continue;
      link.setAttribute("href", href);
      link.removeAttribute("aria-disabled");
      link.removeAttribute("tabindex");
    }
  }

  /** Every store-button click, with the campaign that brought the visitor. */
  function trackStoreClicks(campaign) {
    document.addEventListener("click", (event) => {
      const target = event.target;
      const link =
        target && typeof target.closest === "function"
          ? target.closest("[data-store]")
          : null;
      if (!link) return;
      const href = link.getAttribute("href") || "";
      if (!href) event.preventDefault();
      const properties = {
        store: link.getAttribute("data-store") || "unknown",
        ...campaign,
      };
      if (href) properties.destination = href;
      track("store_click", properties);
    });
  }

  /** OpenPanel's script-tag queue, so calls made before op1.js loads survive. */
  function installQueue() {
    if (typeof window.op === "function") return;
    const queue = [];
    window.op = new Proxy(
      function op() {
        if (arguments.length) queue.push(Array.prototype.slice.call(arguments));
      },
      {
        get(target, property) {
          if (property === "q") return queue;
          return function () {
            queue.push([property].concat(Array.prototype.slice.call(arguments)));
          };
        },
        has(target, property) {
          return property === "q";
        },
      },
    );
  }

  /** Starts the tracker when a client id is configured; false when not. */
  function startAnalytics(campaign) {
    const config = window.ODOMO_ANALYTICS;
    const clientId =
      config && typeof config.clientId === "string" ? config.clientId.trim() : "";
    if (!clientId) return false;
    if (document.querySelector("script[data-opanel-sdk]")) return true;

    const configuredUrl =
      config && typeof config.apiUrl === "string" ? config.apiUrl.trim() : "";
    const apiUrl = (configuredUrl || DEFAULT_API_URL).replace(/\/+$/, "");

    installQueue();
    window.op("init", {
      clientId,
      apiUrl,
      // Pageviews, with the SDK's own __referrer and __path on every event.
      trackScreenViews: true,
      // Outbound links other than the store buttons are not part of MKP-287.
      trackOutgoingLinks: false,
      trackAttributes: false,
      // Explicit: no session replay, ever.
      sessionReplay: { enabled: false },
    });
    if (Object.keys(campaign).length > 0) {
      window.op("setGlobalProperties", campaign);
    }

    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.dataset.opanelSdk = SDK_VERSION;
    document.head.appendChild(script);
    return true;
  }

  const campaign = readCampaign(window.location.search);
  retainCampaignInLocation(campaign);
  upgradeStoreLinks(campaign);
  trackStoreClicks(campaign);
  startAnalytics(campaign);
})();
