# Security Policy

## Supported versions
This is a local-first educational project. The server is intended for local/offline use and includes baseline hardening (CSP, X-Frame-Options, COOP/CORP, Referrer-Policy, nosniff, path traversal protection).

## Reporting a vulnerability
- Please open a GitHub Issue with the `[Security]` prefix. Do not include sensitive data.
- We aim to acknowledge issues within 7 days.

## Scope
- Local Node server in `rgzr/server.js`
- Static frontend assets under `rgzr/`

## Notes
- The `/custom/upload` endpoint only accepts requests from localhost and is capped at 2MB payload.
- For production-like deployments, consider a reverse proxy with HTTPS, stricter CSP, and disabling the upload endpoint.
