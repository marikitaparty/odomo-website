// OpenPanel client for the marketing site (MKP-287).
//
// The client id is public: it names the project, and browser traffic is
// authorised by the project's Origin allow-list, not by a secret. Never put a
// client secret in this file — the site is static and everything here ships to
// visitors.
//
// Empty the client id to turn tracking off completely: assets/analytics.js then
// loads no SDK and sends nothing.
window.ODOMO_ANALYTICS = {
  clientId: "f4cbfaae-4523-4de8-8d54-8c67be905ce8",
  // `apiUrl` is the API base; the tracker posts to `${apiUrl}/track`.
  apiUrl: "https://events.marikita.party/api",
};
