// MKP-287: the marketing site's OpenPanel integration.
//
// The site has no framework and no bundler, so these tests mount the real
// index.html in jsdom, run the real assets/analytics.js, then execute the real
// vendored tracker (assets/op1.js) with fetch stubbed — the assertions are on
// the HTTP bodies the tracker would send.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFile(path.join(REPO, file), "utf8");

const PAGES = [
  "index.html",
  "index-website.html",
  "get.html",
  "account-deletion.html",
  "privacy-policy.html",
  "terms-of-service.html",
];

const [HTML, GET_HTML, GET_JS, ANALYTICS, SDK, COMMITTED_CONFIG] =
  await Promise.all([
    read("index.html"),
    read("get.html"),
    read("assets/get.js"),
    read("assets/analytics.js"),
    read("assets/op1.js"),
    read("assets/analytics-config.js"),
  ]);

const API_URL = "https://events.example/api";
const CAMPAIGN_URL =
  "https://odomo.marikita.party/?utm_source=newsletter&utm_medium=email&utm_campaign=launch&utm_content=hero";

/** Mounts a page, stubs fetch, then runs analytics.js with `config` in place. */
function mount({ config, url = CAMPAIGN_URL, beforeInit, html = HTML } = {}) {
  const dom = new JSDOM(html, {
    url,
    referrer: "https://news.example/article",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const requests = [];
  window.fetch = (input, init = {}) => {
    requests.push({
      url: String(input),
      body: init.body ? JSON.parse(init.body) : null,
    });
    return Promise.resolve({
      status: 200,
      text: async () =>
        JSON.stringify({ deviceId: "device_1", sessionId: "session_1" }),
    });
  };
  window.ODOMO_ANALYTICS = config;
  if (beforeInit) beforeInit(window);
  window.eval(ANALYTICS);
  return { window, requests };
}

/** Executes the vendored tracker, as the appended <script> would. */
function loadSdk(window) {
  window.eval(SDK);
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

function trackedEvents(requests) {
  return requests
    .map(({ body }) => body)
    .filter((body) => body && body.type === "track")
    .map((body) => ({
      name: body.payload.name,
      properties: body.payload.properties ?? {},
    }));
}

function click(window, selector) {
  const element = window.document.querySelector(selector);
  assert.ok(element, `no element for ${selector}`);
  const event = new window.MouseEvent("click", {
    bubbles: true,
    cancelable: true,
  });
  return { element, defaultPrevented: element.dispatchEvent(event) === false };
}

test("every page loads the config before the integration", async () => {
  for (const page of PAGES) {
    const html = await read(page);
    const config = html.indexOf('src="assets/analytics-config.js"');
    const analytics = html.indexOf('src="assets/analytics.js"');
    assert.ok(config > -1, `${page} is missing assets/analytics-config.js`);
    assert.ok(
      analytics > config,
      `${page} must load assets/analytics-config.js before assets/analytics.js`,
    );
  }
});

test("get landing page keeps its Play action inert and counts allowed campaign values", async () => {
  const dom = new JSDOM(GET_HTML, {
    url: "https://odomo.marikita.party/get?utm_source=meta&utm_campaign=launch&foo=1",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.ODOMO_ANALYTICS = { clientId: "test-client", apiUrl: API_URL };
  window.eval(ANALYTICS);
  const play = window.document.querySelector('[data-store="google_play"]');
  assert.equal(play.getAttribute("href"), null);
  assert.equal(play.getAttribute("data-store-url"), "");
  const clickEvent = click(window, '[data-store="google_play"]');
  assert.equal(clickEvent.defaultPrevented, true);
  const storeClick = window.op.q.find(
    ([method, name]) => method === "track" && name === "store_click",
  );
  assert.equal(storeClick?.[2].store, "google_play");
  assert.equal(storeClick?.[2].utm_source, "meta");
  assert.equal(storeClick?.[2].utm_campaign, "launch");
  assert.equal(storeClick?.[2].foo, undefined);
});

test("iPadOS desktop-mode user agents lead with the parked App Store control", () => {
  const dom = new JSDOM(GET_HTML, {
    url: "https://odomo.marikita.party/get",
    runScripts: "outside-only",
    beforeParse(window) {
      Object.defineProperty(window.navigator, "userAgent", {
        configurable: true,
        value:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) " +
          "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      });
      Object.defineProperty(window.navigator, "maxTouchPoints", {
        configurable: true,
        value: 5,
      });
    },
  });

  dom.window.eval(GET_JS);
  assert.deepEqual(
    [...dom.window.document.querySelectorAll("[data-store]")].map((store) =>
      store.getAttribute("data-store"),
    ),
    ["app_store", "google_play"],
  );
});

test("the committed config carries the public client id and the API base", () => {
  const clientId = COMMITTED_CONFIG.match(/clientId:\s*"([^"]*)"/)?.[1];
  assert.match(clientId ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.match(COMMITTED_CONFIG, /apiUrl:\s*"https:\/\/events\.marikita\.party\/api"/);
  const code = COMMITTED_CONFIG.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /secret/i);
});

test("without a client id nothing loads and store clicks send nothing", async () => {
  const { window, requests } = mount({
    config: { clientId: "  ", apiUrl: API_URL },
  });

  assert.equal(window.op, undefined);
  assert.equal(window.openpanel, undefined);
  assert.equal(window.document.querySelector("script[data-opanel-sdk]"), null);

  const appStore = click(window, '[data-store="app_store"]');
  const googlePlay = click(window, '[data-store="google_play"]');
  await flush();

  assert.equal(appStore.defaultPrevented, true);
  assert.equal(googlePlay.defaultPrevented, true);
  assert.deepEqual(requests, []);
});

test("a client id starts the tracker and sends one pageview with the campaign", async () => {
  const { window, requests } = mount({
    config: { clientId: "test-client", apiUrl: API_URL },
  });

  assert.equal(typeof window.op, "function");
  assert.equal(window.openpanel, undefined);
  const sdkScript = window.document.querySelector("script[data-opanel-sdk]");
  assert.ok(sdkScript, "op1.js was not requested");
  assert.match(sdkScript.getAttribute("src"), /^assets\/op1\.js$/);

  loadSdk(window);
  await flush();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${API_URL}/track`);
  const [pageview] = trackedEvents(requests);
  assert.equal(pageview.name, "screen_view");
  assert.equal(pageview.properties.utm_source, "newsletter");
  assert.equal(pageview.properties.utm_medium, "email");
  assert.equal(pageview.properties.utm_campaign, "launch");
  assert.equal(pageview.properties.utm_content, "hero");
  assert.equal(pageview.properties.utm_term, undefined);
  assert.equal(pageview.properties.__path, CAMPAIGN_URL);
  assert.equal(pageview.properties.__referrer, "https://news.example/article");
});

test("pageview URLs retain approved campaign values and drop unknown query parameters", async () => {
  const url =
    "https://odomo.marikita.party/get?utm_source=meta&utm_campaign=launch&email=alice%40example.com&foo=1";
  const { window, requests } = mount({
    config: { clientId: "test-client", apiUrl: API_URL },
    url,
    html: GET_HTML,
  });

  loadSdk(window);
  await flush();

  const [pageview] = trackedEvents(requests);
  const safePath = "https://odomo.marikita.party/get?utm_source=meta&utm_campaign=launch";
  assert.equal(pageview.properties.__path, safePath);
  assert.equal(window.location.search, "?utm_source=meta&utm_campaign=launch");
  assert.equal(pageview.properties.utm_source, "meta");
  assert.equal(pageview.properties.utm_campaign, "launch");
  assert.doesNotMatch(JSON.stringify(pageview.properties), /alice|email|foo/i);
});

test("pageview and store links drop unapproved or free-text UTM values", async () => {
  const url =
    "https://odomo.marikita.party/get?utm_source=alice%40example.com&utm_term=6281234567890&utm_campaign=Jane%20Doe&utm_content=hero";
  const html = GET_HTML.replace(
    'data-store="google_play" data-store-url=""',
    'data-store="google_play" data-store-url="https://play.google.com/store/apps/details?id=com.useodomo.app"',
  );
  const { window, requests } = mount({
    config: { clientId: "test-client", apiUrl: API_URL },
    url,
    html,
  });

  loadSdk(window);
  await flush();

  const [pageview] = trackedEvents(requests);
  const safePath = "https://odomo.marikita.party/get?utm_content=hero";
  assert.equal(pageview.properties.__path, safePath);
  assert.equal(window.location.search, "?utm_content=hero");
  assert.equal(pageview.properties.utm_source, undefined);
  assert.equal(pageview.properties.utm_term, undefined);
  assert.equal(pageview.properties.utm_campaign, undefined);
  assert.equal(pageview.properties.utm_content, "hero");
  assert.doesNotMatch(JSON.stringify(pageview.properties), /alice|6281234567890|Jane Doe/i);

  const storeUrl = new URL(window.document.querySelector('[data-store="google_play"]').href);
  assert.equal(storeUrl.searchParams.get("utm_content"), "hero");
  assert.equal(storeUrl.searchParams.get("utm_source"), null);
  assert.equal(storeUrl.searchParams.get("utm_campaign"), null);
  assert.doesNotMatch(storeUrl.toString(), /alice|6281234567890|Jane|utm_term/i);
});


test("session replay cannot start", async () => {
  const { window, requests } = mount({
    config: { clientId: "test-client", apiUrl: API_URL },
  });
  loadSdk(window);
  await flush();

  assert.equal(window.__openpanel_replay, undefined);
  assert.equal(window.openpanel.options.sessionReplay?.enabled, false);
  assert.equal(window.document.querySelector("script[src*='replay']"), null);
  assert.equal(
    requests.some(({ body }) => body?.type === "replay"),
    false,
  );
});

test("each store button emits store_click carrying the campaign", async () => {
  const { window, requests } = mount({
    config: { clientId: "test-client", apiUrl: API_URL },
  });
  loadSdk(window);
  await flush();
  requests.length = 0;

  const appStore = click(window, '[data-store="app_store"]');
  const googlePlay = click(window, '[data-store="google_play"]');
  await flush();

  assert.equal(appStore.defaultPrevented, true);
  assert.equal(googlePlay.defaultPrevented, true);
  const clicks = trackedEvents(requests).filter(
    (event) => event.name === "store_click",
  );
  assert.deepEqual(
    clicks.map((event) => event.properties.store),
    ["app_store", "google_play"],
  );
  for (const event of clicks) {
    assert.equal(event.properties.utm_source, "newsletter");
    assert.equal(event.properties.utm_medium, "email");
    assert.equal(event.properties.utm_campaign, "launch");
    assert.equal(event.properties.utm_content, "hero");
    assert.equal(event.properties.__path, CAMPAIGN_URL);
    assert.equal(event.properties.destination, undefined);
  }
});

test("configured store links carry the campaign, and Play an install referrer", async () => {
  const APP_STORE = "https://apps.apple.com/app/id1234567890";
  const PLAY =
    "https://play.google.com/store/apps/details?id=com.useodomo.app";
  const { window } = mount({
    config: { clientId: "test-client", apiUrl: API_URL },
    beforeInit(win) {
      win.document
        .querySelector('[data-store="app_store"]')
        .setAttribute("data-store-url", APP_STORE);
      win.document
        .querySelector('[data-store="google_play"]')
        .setAttribute("data-store-url", PLAY);
    },
  });

  const appStore = window.document.querySelector('[data-store="app_store"]');
  const appStoreUrl = new window.URL(appStore.getAttribute("href"));
  assert.equal(appStoreUrl.origin + appStoreUrl.pathname, APP_STORE);
  assert.equal(appStoreUrl.searchParams.get("utm_source"), "newsletter");
  assert.equal(appStoreUrl.searchParams.get("utm_medium"), "email");
  assert.equal(appStoreUrl.searchParams.get("utm_campaign"), "launch");
  assert.equal(appStoreUrl.searchParams.get("utm_content"), "hero");
  assert.equal(appStoreUrl.searchParams.get("referrer"), null);
  assert.equal(appStore.getAttribute("aria-disabled"), null);
  assert.equal(appStore.getAttribute("tabindex"), null);

  const googlePlay = window.document.querySelector('[data-store="google_play"]');
  const playUrl = new window.URL(googlePlay.getAttribute("href"));
  assert.equal(playUrl.hostname, "play.google.com");
  assert.equal(playUrl.searchParams.get("id"), "com.useodomo.app");
  assert.equal(playUrl.searchParams.get("utm_campaign"), "launch");
  assert.equal(
    playUrl.searchParams.get("referrer"),
    "utm_source=newsletter&utm_medium=email&utm_campaign=launch&utm_content=hero",
  );
});

test("approved campaign values are trimmed and unknown values are dropped", async () => {
  const long = "a".repeat(500);
  const url = `https://odomo.marikita.party/?utm_source=%20%09newsletter%20&utm_campaign=${long}`;
  const { window, requests } = mount({
    config: { clientId: "test-client", apiUrl: API_URL },
    url,
  });
  loadSdk(window);
  await flush();

  const [pageview] = trackedEvents(requests);
  assert.equal(pageview.properties.utm_source, "newsletter");
  assert.equal(pageview.properties.utm_campaign, undefined);
  assert.equal(window.location.search, "?utm_source=newsletter");
});

function runBuild(out, env) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ["scripts/build.mjs", "--out", out],
      { cwd: REPO, env: { ...process.env, ...env }, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr || stdout || error.message));
        else resolve(stdout);
      },
    );
  });
}

test("build injects the configured client id, or copies the committed config", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "odomo-site-build-"));
  try {
    const injectedOut = path.join(dir, "injected");
    await runBuild(injectedOut, {
      ODOMO_OP_CLIENT_ID: "built-client",
      ODOMO_OP_API_URL: "https://events.stg-marikita.party/api",
    });
    const injectedConfig = await readFile(
      path.join(injectedOut, "assets", "analytics-config.js"),
      "utf8",
    );
    assert.match(injectedConfig, /"built-client"/);
    assert.match(injectedConfig, /https:\/\/events\.stg-marikita\.party\/api/);
    const html = await readFile(path.join(injectedOut, "index.html"), "utf8");
    assert.match(html, /assets\/analytics\.js/);
    await access(path.join(injectedOut, "assets", "op1.js"));

    const plainOut = path.join(dir, "plain");
    await runBuild(plainOut, {
      ODOMO_OP_CLIENT_ID: "",
      ODOMO_OP_API_URL: "",
    });
    const plainConfig = await readFile(
      path.join(plainOut, "assets", "analytics-config.js"),
      "utf8",
    );
    assert.equal(plainConfig, COMMITTED_CONFIG);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
