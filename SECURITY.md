# Security Policy

## Supported Versions

Only the `main` branch receives security updates. Please always run the latest release.

## Reporting a Vulnerability

**Please do not open a public issue for security problems.**

If you discover a vulnerability, report it privately via one of the following:

- **GitHub Private Vulnerability Reporting** — https://github.com/prathamshukla28/-ComeBack-/security/advisories/new (preferred)
- **Email** — reach the maintainer through the contact linked on their [GitHub profile](https://github.com/prathamshukla28)

Include as much of the following as possible:

- A clear description of the issue and its impact
- Steps to reproduce (proof-of-concept if available)
- Affected version / commit SHA
- Any suggested mitigation

## What to expect

- **Acknowledgement** within 72 hours
- **Triage & severity assessment** within 7 days
- **Fix or mitigation timeline** communicated back to you
- **Public disclosure** coordinated with you once a patch is available

## Scope

In scope:

- Authentication and session handling (Supabase, biometric gates)
- Data validation, storage, and Row-Level Security bypasses
- Client-side secret exposure
- Dependency vulnerabilities in `package.json`

Out of scope:

- Issues in third-party services (report to them directly)
- Social engineering
- Physical attacks

## Safe Harbor

We consider security research conducted in good faith under this policy to be authorized. We will not pursue legal action against researchers who follow this policy.

Thank you for helping keep ComeBack and its users safe.
