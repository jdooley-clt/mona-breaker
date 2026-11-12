# Security policy

## Supported versions

Mona Breaker is a static, client-side game. The only supported version is the
`main` branch, which is what the live site at
<https://jdooley-clt.github.io/mona-breaker/> serves after the **Cabinet
compatibility** workflow passes. Older commits, forks, and local copies are
not supported.

## Reporting a vulnerability

Please report security issues privately through GitHub's private vulnerability
reporting for this repository:

<https://github.com/jdooley-clt/mona-breaker/security/advisories/new>

Do not open a public issue for a security report. Include the page URL, the
browser and version, the steps to reproduce, and what you believe the impact
is. You will get an acknowledgement through the advisory thread, and the fix
will ship through the normal tested deploy to GitHub Pages.

## Scope

- The game runs entirely in the browser. There is no server, account system,
  telemetry, or network request after the page and its vendored files load.
- Browser `localStorage` is used only for the best score, the theme choice,
  and the music and sound-effect preferences. Nothing is sent anywhere.
- The published page sets a strict Content Security Policy that only allows
  scripts and styles from its own origin, and a referrer policy of
  `strict-origin-when-cross-origin`.
- Third-party code is limited to the vendored Three.js build in `vendor/`.
  Dependabot keeps the development dependencies and GitHub Actions current.

Issues in GitHub Pages or GitHub Actions themselves should go to
[GitHub's bug bounty program](https://bounty.github.com/).
