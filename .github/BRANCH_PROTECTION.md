# Branch protection checklist

Protected branches should require these checks to pass before merging:
- Frontend Lint, Tests & Coverage
- Frontend Build
- Soroban Contract Checks

## CI Supply Chain & Action Pinning Policy

To mitigate CI supply chain risks (e.g. compromised or retagged third-party actions running with workflow permissions):
- **Immutable SHA Pinning**: Every third-party GitHub Action referenced in `.github/workflows/` must be pinned to a full 40-character commit SHA rather than a mutable tag.
- **Version Comments**: Each pin must include a trailing comment with the corresponding semantic version tag, for example:
  ```yaml
  uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
  ```
- **Automated Updates**: Dependabot is configured (`.github/dependabot.yml`) for `package-ecosystem: github-actions` to monitor for new action versions and submit PRs that update both the commit SHA and trailing version comment.
- **Least-Privilege Permissions**: All workflows must explicitly declare minimal `permissions:` required for their jobs.
