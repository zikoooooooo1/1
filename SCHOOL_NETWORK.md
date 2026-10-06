# School network deployment

Academic data workflows use the school's application origin. Microsoft-backed student accounts additionally require the school's Entra ID service. Administrator-created local accounts work without that dependency. Browser assets, icons, translations, API requests, and file downloads are served by that origin. Fonts use local system stacks. There are no external analytics, embedded video players, AI APIs, CDNs, or third-party widgets in required flows.

## Allowlisting

Students and staff need HTTPS access to the configured school hostname and its certificate trust chain. The deployment host needs package-registry access during dependency installation (or a school-approved npm mirror); runtime does not need npm access. A source/deployment pipeline may need GitHub access. Build artifacts and dependencies can be transferred to an isolated host through the school's approved process.

External links created as learning resources may require additional allowlisting. They are optional content, not application infrastructure. Prefer uploaded, approved resources when external sites are blocked.

## Proxy and hosting

Keep the browser/API/file origin consistent. Preserve `Host` and forwarded protocol at a trusted proxy. Configure upload limits to accept the application's 10 MB maximum. Avoid proxies that cache authenticated `/api` responses. Do not expose the raw upload directory or database volume as a static directory.

## Caching and connectivity

Production static assets can be cached; private API and file responses are `no-store`. No service worker stores school data. Language and appearance preferences are the only application local-storage values.

The client reports offline connectivity and retains open form input in memory. Exam answers autosave to the server and retry after reconnection while the attempt remains open. Failed operations display errors with a retry path. Import confirmation and assignment/exam submission resist duplicate execution.

This is not full offline support. Closing/reloading a tab can discard unsaved in-memory input. Server deadlines continue during outages, and late exam answers are rejected. Schools should provide a supervised recovery policy for network incidents. The application cannot bypass school firewall or filtering restrictions.

## Microsoft authentication allowlist

Browsers must reach the school's Microsoft Entra sign-in pages and their Microsoft-owned authentication assets under school IT's approved Microsoft 365 allowlist. The CLASO server must reach `https://login.microsoftonline.com` for discovery, token exchange and signing keys. Incoming Microsoft redirects return through the public CLASO HTTPS origin; no inbound server-to-server webhook is needed. Existing authenticated academic sessions continue during a provider outage until session expiry, but new Microsoft student sign-ins require provider connectivity; local account sign-in remains available. The application cannot bypass school network restrictions.
