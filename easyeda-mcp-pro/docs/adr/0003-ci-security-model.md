# ADR 0003: CI Security Model for GitHub Actions

## Status

Accepted

## Context

CI/CD workflows have access to sensitive repository operations, package registry credentials, and deployment environments. Compromised third-party GitHub Actions represent a major supply-chain security vector. We need a security policy that:

1. Prevents malicious actors from hijacking workflows via mutable version tags.
2. Limits the blast radius of a compromised action by restricting execution permissions.
3. Provides cryptographic proof of package origins.

## Decision

We enforce a strict security model for all GitHub Actions:

- **Action Pinning**: All GitHub Actions must be referenced by their full 40-character commit SHA (e.g. `actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10`), rather than mutable tags like `@v4`. Comment labels (e.g. `# actions/checkout v4.1.1`) must accompany each definition.
- **Least Privilege Permissions**: Workflows must default to `permissions: contents: read`. Specific jobs requiring elevated privileges (like `release-please` writing content or publishing OIDC tokens) must explicitly list the required scopes (e.g., `contents: write`, `id-token: write`).
- **NPM Provenance**: NPM publishing is configured to run with `--provenance`. This generates a signed attestation linking the published package back to the specific GitHub Actions execution log and commit.
- **Concurrency**: Workflows define concurrency groups to prevent multiple concurrent runs on the same branch or tag, avoiding conflicts and token session overlaps.

## Consequences

- **Pros**:
  - Immunizes the repository against compromised third-party action tag updates.
  - Ensures transparency and trust for consumers via NPM provenance.
  - Minimizes the risk of unauthorized writes by keeping default permissions read-only.
- **Cons**:
  - Upgrading GitHub Actions requires manually updating SHAs in `.yml` files (though Renovate handles this if configured).
