# Security Policy

Jerico is under active development. There are no stable release channels or guaranteed security-fix timelines yet.

## Reporting a vulnerability

**Do not disclose suspected vulnerabilities in public issues, pull requests, discussions, or social posts.**

1. If GitHub private vulnerability reporting is enabled for this repository, use the repository's **Security → Advisories → Report a vulnerability** flow.
2. If that option is unavailable, contact the repository maintainer through the contact method listed on the maintainer's GitHub profile and request a private reporting channel. Do not send exploit details until a private channel is established.

Please include:
- Affected commit, branch, package, or deployment mode (managed Cloudflare or self-hosted).
- Impact and realistic attack prerequisites.
- Minimal reproduction steps or a proof of concept that does not access real customer data.
- Relevant sanitized logs, request/response excerpts, and configuration details.
- Any suggested mitigation, if known.

Do not include live credentials, private keys, customer data, or unredacted production logs. Rotate any credential that may have been exposed.

## Scope

Security reports are especially useful for:
- Authentication, authorization, and cross-tenant data access.
- Ingestion credential handling, idempotency, quotas, and replay protection.
- Webhook signing, notification delivery, and secret encryption.
- Uptime-probe and webhook SSRF protections, DNS pinning, and redirect handling.
- Queue leases, dead-letter/replay controls, and worker/API boundaries.
- Telemetry redaction, retention/deletion, and ClickHouse query isolation.
- Self-hosted secrets, Docker/Compose permissions, backup encryption, and restore flows.
- Dependency and build/release supply-chain vulnerabilities.

## Handling and disclosure

The maintainer will review reports as capacity permits and coordinate remediation and disclosure with the reporter. No response-time SLA, bug bounty, or safe-harbor commitment is currently offered. Please allow a reasonable period for investigation and remediation before any public disclosure.

Do not perform destructive testing, denial-of-service testing, or access other users' data on production systems. Use an isolated environment and synthetic data for validation.
