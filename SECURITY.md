# Security Policy

Jerico is an early-stage project. Please do not disclose suspected vulnerabilities in public issues.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting feature for this repository if it is enabled. If private reporting is unavailable, contact the repository maintainer privately through GitHub.

Include a clear description, impact, reproduction steps or proof of concept, affected commit/release, and suggested mitigation where possible. Do not include real credentials, customer information, or production telemetry.

## Security expectations

- Never commit secrets or tokens.
- Treat telemetry and integration payloads as untrusted input.
- Enforce organization/project/environment authorization server-side.
- Hash ingestion credentials; encrypt integration secrets.
- Apply rate, payload-size, and retention limits.
- Protect uptime checks against SSRF, DNS rebinding, and unsafe redirects.
- Keep dependencies and build tooling updated.
