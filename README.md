# Frogbot v3 Lab

A minimal lab for demoing [Frogbot v3](https://docs.jfrog.com/security/docs/frogbot-v3): PR
scanning, scheduled repo scanning with auto-remediation PRs, and SARIF / SBOM upload to GitHub.

The `package.json` deliberately pins known-vulnerable versions of `lodash`, `express`,
`minimist`, and `axios` so Xray has something to flag.

## 1. JFrog Platform prep (tomjfrog)

1. Create an **identity token** with Xray read + read access on the relevant remote/virtual repos.
2. Create a **Watch** named `frogbot-watch` bound to a security policy that flags High/Critical CVEs.
3. (Optional) Create a **JFrog Project** and set `jfrogProjectKey` in `.frogbot/frogbot-config.yml`.

## 2. GitHub repo prep

1. Push this directory to a new GitHub repo.
2. Add repo secrets:
   - `JF_URL` → e.g. `https://tomjfrog.jfrog.io`
   - `JF_ACCESS_TOKEN` → identity token from step 1 above
3. Create a **Protected Environment** named `frogbot`:
   - Settings → Environments → New environment → `frogbot`
   - Add yourself as a Required Reviewer
   - This is mandatory for public repos using `pull_request_target` — Frogbot refuses
     to run without it to prevent token leakage from forked PRs.

## 3. Demo flows

### Flow A — PR scan blocks a vulnerable change

```bash
git checkout -b bump-lodash
# edit package.json to 4.17.20 (still has CVE-2020-8203) or back to 4.17.4
git commit -am "bump lodash" && git push -u origin bump-lodash
gh pr create --fill
```

Expected: Frogbot comments on the PR with newly-introduced CVEs and fails the check
(because `JF_FAIL: TRUE` + `failOnSecurityIssues: true`).

### Flow B — scheduled scan opens auto-fix PR

```bash
gh workflow run "Frogbot Scan Repository"
```

Expected: Frogbot opens an aggregated PR that bumps the vulnerable deps to fixed versions
(thanks to `JF_GIT_AGGREGATE_FIXES: TRUE` + `JF_FIXABLE_ONLY: TRUE`).

### Flow C — Code Scanning + Dependency Graph integration

After the scheduled run completes:
- **Security → Code scanning** in the repo shows SARIF findings (SCA + SAST + IaC + Secrets).
- **Insights → Dependency graph** shows the uploaded SBOM.

## 4. Files

| Path | Purpose |
| --- | --- |
| `.github/workflows/frogbot-scan-pr.yml` | Runs on every PR; comments + fails on new vulns. |
| `.github/workflows/frogbot-scan-repo.yml` | Scheduled + `workflow_dispatch`; opens fix PRs, uploads SARIF + SBOM. |
| `.frogbot/frogbot-config.yml` | v3 centralized config — overrides env vars, enables JAS scanners. |
| `package.json` | Vulnerable dependency manifest used as the scan target. |
| `index.js` | Tiny sample app so the deps are actually used (not strictly required for scanning). |

## 5. Talking points

- **Build-independent scanning** — JAS scanners (SAST/Secrets/IaC) don't need `npm install`
  to run. SCA still benefits from `installCommand` for accuracy on transitive deps.
- **`disableJas: false`** in the config is what flips on the v3 Advanced Security scanners.
  If your token lacks the Advanced Security entitlement, JAS findings are silently skipped.
- **Config Profiles** — for an org-wide demo, configure the equivalent of this file
  centrally in the JFrog Platform and let it inherit to every repo automatically.
