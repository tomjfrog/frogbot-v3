# Frogbot V3 — Live Demo Guide

SE-facing walkthrough for this lab. Spec and acceptance criteria live in [SPEC.md](SPEC.md). Historical Platform hang notes: [ISSUES.md](ISSUES.md). Short README overview: [README.md](README.md).

**Audience:** customer evaluating Frogbot + Xray + JAS on GitHub Actions.  
**Target time:** 15–25 minutes live.  
**Platform:** `https://tomjpd2.jfrog.io` (current lab JPD; older notes referring to `tomjpd` are historical)  
**Repo:** this GitHub repo (`frogbot-v3`), workflows pin `jfrog/frogbot@v3`.

---

## 1. What this lab is set up to prove

Frogbot shifts security left **inside the developer’s existing GitHub workflow**:

| Moment | One-line story |
| --- | --- |
| **M6** | Auth to JFrog is **OIDC** — no long-lived Platform token in GitHub secrets. |
| **M1** | A risky PR gets a Frogbot comment and a **failed required check** that **blocks merge**. |
| **M3** | Contextual Analysis marks the new CVE **Applicable** when the call site matches the exploit shape — and still contrasts declared-but-unused noise. |
| **M2** | A full **repo scan** opens autofix PR(s) to upgrade vulnerable dependencies. |
| **M4** | Scan results + **SBOM** land in the JFrog Platform Scans List. |
| **M5** | Planted **OSS snippet** and **inactive fake secret** show up; secret validation says not live. |

Optional secondary surface (not a §2 acceptance moment): GitHub **Security → Code scanning** after SARIF upload — see [SPEC.md §8](SPEC.md#8-github-code-scanning--security-tab).

### Architecture (keep this picture in your head)

```text
Customer opens a PR  ──►  frogbot-scan-pr.yml   (pull_request_target)
                            OIDC → JFrog token
                            Diff scan → PR comment + fail check
                            Branch protection requires "scan-pull-request"

SE runs repo scan    ──►  frogbot-scan-repo.yml  (workflow_dispatch / cron)
                            OIDC → JFrog token
                            Full scan → autofix PR(s) + Platform Scans List
```

**PR scan** answers: “What did *this change* introduce?”  
**Repo scan** answers: “What’s already on the branch?” and can open fix PRs.

**Merge gate (lab-hardened):** Xray policy `frogbot-demo-medium-and-above` has **`fail_pull_request: { active: true }`**. Frogbot V3 fails the PR job only when that policy action is set on a violation (not merely because `JF_FAIL=TRUE`). GitHub **branch protection on `main`** requires the check named **`scan-pull-request`**, so a red Frogbot job blocks merge.

---

## 2. Lab inventory (what’s already planted)

| Asset | Role in the demo |
| --- | --- |
| `package.json` (on `main`) | Pins vulnerable: `lodash@4.17.4`, `express@4.16.0`, `minimist@1.2.0`, `axios@0.21.0`, `moment@2.18.1`, `handlebars@4.0.11` |
| `package-lock.json` | Must resolve via **`tomjpd2`** / `npm-remote` (never bare `npm install` on a PTC machine) |
| `index.js` (on `main`) | **Applicable** call sites: lodash `merge`/`template`, moment parse, Handlebars `compile` |
| `axios` / `minimist` | Declared in `package.json` but **never required** → Contextual Analysis **not applicable** contrast |
| `demo-plants/oss-snippet.js` | Copied `ms` package logic (not a dependency) → snippet detection |
| `demo-plants/fake-secrets.js` | Fake `ghp_…` PAT (all zeros) → Secrets + dynamic validation **inactive** |
| **M1 plant branch** `frogbot-risky-pr` | Adds **`jsonwebtoken@8.5.1`** + `/verify` route calling `jwt.verify` so High CVEs show as **Applicable** |
| `.github/workflows/frogbot-scan-pr.yml` | PR gate; Environment `frogbot`; `JF_MIN_SEVERITY: Medium` |
| `.github/workflows/frogbot-scan-repo.yml` | Repo scan + autofix; `JF_GIT_AGGREGATE_FIXES` / `JF_FIXABLE_ONLY` |
| OIDC | `oidc-provider-name: github-oidc-integration` (must match Platform provider name) |
| Variable | `JF_URL` = `https://tomjpd2.jfrog.io` (Actions **variable**, not a secret) |
| Platform Watch | **`Frogbot-Watch`** on `github.com/tomjfrog/frogbot-v3.git` (+ org-level **`Source-Code-Watch`**) |
| Platform policy | **`frogbot-demo-medium-and-above`** (Medium+; `fail_build` + **`fail_pull_request.active`**) |
| GitHub protection | `main` requires status check **`scan-pull-request`** (strict, enforce admins) |

---

## 3. Pre-demo checklist (before the customer joins)

Do these once the morning of the demo. Aim for a clean stage.

### Platform (`tomjpd2`)

- [ ] You can log into `https://tomjpd2.jfrog.io`.
- [ ] OIDC provider name matches the workflow (`github-oidc-integration`).
- [ ] JAS scanners available (Contextual Analysis, Secrets + dynamic validation; snippet if licensed).
- [ ] Open **Application → Xray → Scans List → Git Repositories** and filter/search this repo so M4 is one click away.
- [ ] Watches attached to this git repo still resolve (expect `Frogbot-Watch` via `/api/v1/xsc/watches/resource?git_repository=…`).
- [ ] Policy **`frogbot-demo-medium-and-above`** still has **Fail Pull Request** enabled (UI: Policy → rule → Actions). Frogbot V3 will not fail the PR check without it.
- [ ] Quick indexing health check (should reach `DONE`, not stuck `PENDING`):

```bash
jf xr curl -s -XPOST /api/v1/artifact/status \
  -H "Content-Type: application/json" --server-id tomjpd2 \
  -d '{"repo":"npm-remote-cache","path":"minimist/-/minimist-0.0.10.tgz"}'
# Want overall.status == DONE
```

If indexing is stuck forever, see historical notes in [ISSUES.md](ISSUES.md) (`tomjpd`). That hang should **not** reproduce on healthy `tomjpd2`.

### GitHub

- [ ] Actions variable `JF_URL` = `https://tomjpd2.jfrog.io`; **no** `JF_ACCESS_TOKEN` in secrets.
- [ ] **Settings → Actions → General:** “Allow GitHub Actions to create and approve pull requests” is **on**.
- [ ] **Settings → Branches:** `main` protection requires **`scan-pull-request`**.
- [ ] Both workflows have `permissions.security-events: write` (Code Scanning) and `id-token: write` (OIDC).
- [ ] Public repo: Environment **`frogbot`** still has a required reviewer for PR scans (approve when the job waits).
- [ ] Close or merge leftover Frogbot autofix PRs and delete leftover `frogbot-*` branches so **M2** is dramatic — **except** keep / re-open the intentional **`frogbot-risky-pr`** demo PR for M1/M3 if you plan to reuse it.
- [ ] Confirm last **Frogbot Scan Repository** run on `main` is green (~1–2 minutes).

### Optional smoke (5 minutes)

```bash
gh workflow run "Frogbot Scan Repository" --ref main
gh run watch
gh pr list --state open
# Expect PR #13-style risky PR (or recreate from frogbot-risky-pr) to show scan-pull-request = failure + merge blocked
```

---

## 4. Suggested live order (15–25 min)

| # | Moment | Time | Primary UI |
| --- | --- | --- | --- |
| 1 | **M6** OIDC | ~30–60s | Workflow YAML + repo secrets/variables |
| 2 | **M1** PR SCA gate + merge block | ~5–7 min | `frogbot-risky-pr` PR (jsonwebtoken) |
| 3 | **M3** Contextual Analysis | ~2–3 min | Same PR: Applicable Highs + not-applicable contrast |
| 4 | **M2** Autofix | ~3–5 min | Actions → repo scan → Fix PR(s) |
| 5 | **M4** Scans List + SBOM | ~3 min | JFrog Platform |
| 6 | **M5** Snippet + secret | ~2–3 min | Same Platform commit (and/or Code Scanning) |
| 7 | Close | ~1 min | Adjacent products (Config Profiles, IDE) — verbal only |

GitHub Code Scanning alerts are a nice “developer already lives here” aside after M2 or M5 if time allows.

---

## 5. Moment playbooks

### M6 — OIDC authentication

**What you prove:** CI talks to JFrog with a short-lived token minted from GitHub’s OIDC identity. No long-lived `JF_ACCESS_TOKEN` sitting in the repo.

**Show**

1. Open `.github/workflows/frogbot-scan-repo.yml` (or the PR workflow).
2. Call out:
   - `permissions.id-token: write`
   - `oidc-provider-name: github-oidc-integration`
   - `JF_URL: ${{ vars.JF_URL }}` (variable, not secret) → `https://tomjpd2.jfrog.io`
   - `JF_GIT_TOKEN: ${{ secrets.GITHUB_TOKEN }}` (GitHub API only)
3. GitHub → **Settings → Secrets and variables → Actions**: show `JF_URL` under Variables; confirm **no** Platform access token secret.

**Talking points**

- Identity mapping on the Platform scopes which GitHub repo/workflow can mint tokens.
- Rotate/revoke is Platform-side; developers never paste Artifactory passwords into Actions secrets for this path.

**Done when:** Customer sees the pattern and agrees there is no long-lived JFrog token in the repo.

---

### M1 — PR blocks a bad SCA change (and blocks merge)

**What you prove:** Frogbot comments on the PR with **new** findings (diff vs target), **fails** the `scan-pull-request` check, and GitHub **branch protection refuses merge** until the gate is green.

**Important:** Workflows that Frogbot itself creates with `GITHUB_TOKEN` do **not** re-trigger `pull_request_target`. For M1 you must open (or reuse) a PR **yourself**.

#### Preferred plant (already integrated): `jsonwebtoken@8.5.1`

Branch **`frogbot-risky-pr`** adds a High-severity package that is **not** on `main`, so the PR scan reports it as new:

| Piece | Detail |
| --- | --- |
| Dependency | `jsonwebtoken@8.5.1` (fix: `9.0.0`) |
| High CVEs | **CVE-2022-23540**, **CVE-2022-23539** (plus Medium CVE-2022-23541) |
| Call site | `index.js` → `GET /verify` → `jwt.verify(token, process.env.JWT_SECRET)` without an `algorithms` option |

**Reuse the open PR** (typical demo path):

1. Open the existing PR from `frogbot-risky-pr` (e.g. [#13](https://github.com/tomjfrog/frogbot-v3/pull/13) or recreate if closed).
2. If the Environment gate is waiting, approve **`frogbot`**.

**Recreate from scratch if needed**

```bash
git fetch origin && git checkout main && git pull
git checkout -b frogbot-risky-pr

# Add to package.json dependencies:
#   "jsonwebtoken": "8.5.1"
# Add /verify route in index.js (jwt.verify with process.env.JWT_SECRET, no algorithms)

jf npm-config --server-id-resolve=tomjpd2 --repo-resolve=npm-remote
jf npm install
# Confirm lockfile URLs are tomjpd2.jfrog.io — never bare npm install on PTC laptops

git add package.json package-lock.json index.js
git commit -m "demo: add risky jsonwebtoken"
git push -u origin HEAD
gh pr create --title "demo: risky jsonwebtoken" --body "Demo PR for Frogbot M1/M3"
```

**Show**

1. PR → **Checks**: job **`scan-pull-request`** (workflow *Frogbot Scan Pull Request*) runs and ends **red**.
2. Frogbot **PR comment**: High CVEs on `jsonwebtoken@8.5.1`, Contextual Analysis **Applicable**, Watch names (`Frogbot-Watch` / `Source-Code-Watch`), fix version `9.0.0`.
3. Action log includes: `Security violation with 'fail-pull-request' rule is found` (Frogbot V3 fail path).
4. PR **Merge** button / merge status: **blocked** because `main` requires `scan-pull-request`.

**Talking points**

- PR scan is **diff-aware**: only what *this* change introduced vs `main`.
- **Policy + GitHub protection together** close the loop: Xray decides the violation is merge-blocking; GitHub enforces the failed check.
- Call out that Frogbot V3 fails the job on the policy’s **Fail Pull Request** action (not on `JF_FAIL` alone when Watches drive violations mode).

**Done when:** Comment is visible, `scan-pull-request` is failed, and merge is blocked.

**Pitfalls**

- Environment `frogbot` waiting on reviewer → approve so the job starts.
- Lockfile regenerated with bare `npm` → wrong registry / PTC → bad SCA story. Always `jf npm` against **`tomjpd2`**.
- Opening a PR that doesn’t change dependencies may yield “no new issues.”

---

### M3 — Contextual Analysis (applicable vs not applicable)

**What you prove:** Not every CVE on a declared package is equally urgent. Frogbot/JAS marks reachable use as **applicable** and unused packages as **not applicable** (or equivalent).

**Where the contrast is planted**

| Status | Packages / CVEs | Why |
| --- | --- | --- |
| **Applicable (M1 PR)** | `jsonwebtoken` CVE-2022-23540 / CVE-2022-23539 | `/verify` calls `jwt.verify` without an `algorithms` option |
| **Applicable (on main)** | `lodash`, `moment`, `handlebars` | Called on HTTP routes in `index.js` |
| **Not applicable** | `axios`, `minimist` | In `package.json` only — never `require`’d |

**Show**

1. On the **M1 PR**: in the Frogbot table, point at **Applicable** on the High jsonwebtoken CVEs.
2. On a repo-scan / Platform view of `main`: show lodash/moment/handlebars applicable vs axios/minimist not applicable.
3. Optionally open `index.js` on the PR branch and show the `/verify` call site.

**Talking points**

- “Fix what is reachable first” — reduces noise without pretending unused deps don’t exist.
- Same scanners power IDE / Platform stories elsewhere in the JFrog pitch.

**Done when:** Customer sees at least one **Applicable** High on the risky PR and understands the not-applicable contrast on `main`.

---

### M2 — Autofix from repository scan

**What you prove:** A scheduled or on-demand **full branch scan** can open fix PR(s) that upgrade vulnerable dependencies. Autofix is **not** the outcome of a PR scan.

**Show**

1. Close leftover Frogbot fix PRs / delete `frogbot-*` branches if any (otherwise Frogbot skips: “a fix branch already exists”). Keep `frogbot-risky-pr` if you still need M1.
2. GitHub → **Actions** → **Frogbot Scan Repository** → **Run workflow** (branch `main`).
3. Watch the run (~1–2 min when healthy). Log should pass “Xray is processing your scan results…” quickly, then create fix PRs — not hang ~20 minutes.
4. Open the new Frogbot PR(s) under **Pull requests**.

**CLI alternative**

```bash
gh workflow run "Frogbot Scan Repository" --ref main
gh run watch
gh pr list --author "app/github-actions"   # or filter by title "[🐸 Frogbot]"
```

**Talking points**

- Repo scan = debt already on `main`; PR scan = change under review.
- `JF_FIXABLE_ONLY` keeps the autofix story on packages that have a fix version.
- Spec prefers **one aggregated** PR (`JF_GIT_AGGREGATE_FIXES`). If the Platform Config Profile wins and you get **one PR per package**, still sell the moment (“Frogbot opened fix PRs”) and note aggregation is configurable — see [ISSUES.md](ISSUES.md) on V3 config profiles vs local YAML.

**Done when:** At least one Frogbot fix PR is open with a dependency bump.

**Pitfalls**

- `403 GitHub Actions is not permitted to create or approve pull requests` → enable the Actions setting in §3.
- Orphaned `frogbot-*` branches without PRs → delete branches, re-run.
- 20-minute hang after local scanners → [ISSUES.md](ISSUES.md) (historical `tomjpd` indexing stall; re-check artifact status on `tomjpd2` if it returns).

---

### M4 — SBOM / Security Issues in Platform Scans List

**What you prove:** Git findings are not trapped in Actions logs. The Platform is the system of record for **Security Issues** and **SBOM** on the Git repository.

**Show**

1. After a successful repo (commit) scan:  
   **Application → Xray → Scans List → Git Repositories**
2. Select this repo → latest **commit** (or PR, if shown).
3. Open **Security Issues** and **SBOM** (component inventory / transitive view as available).

**Talking points**

- Same Platform surface customers already use for binaries/builds — Git is now first-class.
- SBOM supports transitive visibility and inventory conversations without a separate tool.
- On `tomjpd2`, SBOM uploads under the `frogbot` Artifactory repo reach `artifact/status` **DONE** (indexing healthy).

**Done when:** Customer sees this repo’s commit with Security Issues and an SBOM/component list.

**Pitfalls**

- Don’t demote Platform for GitHub Code Scanning; treat GitHub as secondary developer UI ([SPEC.md §8](SPEC.md#8-github-code-scanning--security-tab)).

---

### M5 — Snippet detection + inactive secret validation

**What you prove:** (1) First-party copies of OSS code can be flagged even when the package isn’t a dependency. (2) Finding a secret-shaped string is not enough — **dynamic validation** shows whether it’s still live.

**Plants (already on `main`)**

| File | Expected signal |
| --- | --- |
| `demo-plants/oss-snippet.js` | Snippet / OSS copy finding (`ms`-derived logic, MIT, not installed) |
| `demo-plants/fake-secrets.js` | Secrets finding on `ghp_0000…`; validation **inactive / invalid / not active** |

**Show**

1. In Platform commit detail from M4: locate snippet and secrets findings.
2. On the secret: highlight validation status (not a live credential).
3. Optional: open the two plant files in the IDE/GitHub so the customer sees the labeled `DEMO:` comments.
4. Optional: GitHub **Security → Code scanning** if SARIF upload is enabled.

**Talking points**

- Snippet detection catches “copy-paste OSS” supply-chain / license risk.
- Inactive validation avoids panic pages on demo tokens and teaches the live-vs-dead distinction for real incidents.

**Done when:** Both plants are visible with the secret marked inactive/invalid.

**Pitfalls**

- Snippet detection depends on JAS entitlement / instance capability — if missing, show the plant and document the gap.
- Do **not** replace the fake token with a real PAT.

---

## 6. Optional: GitHub Code Scanning aside

After M2 or M5:

1. GitHub → **Security → Code scanning alerts**.
2. Filter by tools Frogbot uploaded (Xray / SAST / Secrets as present).
3. One sentence: “Same findings, where developers already look for Dependabot/CodeQL.”

Requirements and recovery: [SPEC.md §8](SPEC.md#8-github-code-scanning--security-tab) (`security-events: write` is already on both workflows).

---

## 7. Close / adjacent (verbal only)

Keep to one line each — do not demo unless asked:

- **Platform Config Profiles** — central Frogbot policy inheritance for many repos (`System_Default_Profile` appears in Action logs).
- **IDE scanning** — same engine closer to the keyboard.
- **Curation / PTC** — why this lab’s lockfile must resolve through **`tomjpd2`** (corporate PTC would poison SCA).
- **Fail Pull Request policy action** — Platform policy is what makes Frogbot V3 fail the GitHub check in violations mode; branch protection is what blocks merge.

---

## 8. Reset between demos

```bash
# Close Frogbot autofix PRs; keep or recreate the risky demo PR separately
gh pr list --state open
gh pr close <n> --comment "demo reset"   # autofix PRs only

# Delete leftover fix / demo branches (preserve frogbot-risky-pr if reusing M1)
gh api repos/tomjfrog/frogbot-v3/branches --jq '.[].name' | grep -E '^(frogbot-|demo/)' | while read b; do
  [ "$b" = "frogbot-risky-pr" ] && continue
  gh api -X DELETE "repos/tomjfrog/frogbot-v3/git/refs/heads/$b"
done

git checkout main && git pull
# Keep vulnerable package.json + demo-plants on main — do not “clean up” plants
```

Re-run a green **Frogbot Scan Repository** once if you want a fresh Scans List timestamp before the next customer.

**M1 reset:** leave `frogbot-risky-pr` open (merge stays blocked — that’s the point), or close and re-push the plant branch before the next customer.

---

## 9. Troubleshooting cheat sheet

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Hang after `Xray is processing your scan results...` | Xray indexing / violations wait | [ISSUES.md](ISSUES.md); confirm `artifact/status` → `DONE` on `tomjpd2` |
| Frogbot finds issues but check stays **green** | Policy missing **Fail Pull Request** | Set `fail_pull_request: { "active": true }` on the security policy rule (UI or API object shape — boolean `true` is rejected) |
| Check red but merge still allowed | Branch protection missing | Require status check **`scan-pull-request`** on `main` |
| `403` on `code-scanning/sarifs` | Missing `security-events: write` | SPEC §8 |
| `403` creating pull requests | Actions “create and approve PRs” off | SPEC §8 / §4.2 |
| “Fix branch already exists” | Orphaned `frogbot-*` branches | Delete branches, re-run |
| PR scan never runs on Frogbot’s own PRs | `GITHUB_TOKEN` doesn’t re-trigger workflows | Open M1 PR by hand |
| PR job stuck “Waiting for approval” | Environment `frogbot` | Approve deployment |
| Weird / empty SCA | Lockfile via PTC / `npmjs` | Regenerate with `jf npm` on **`tomjpd2`** |
| YAML watch name ≠ Platform | V3 uses Config Profile + Platform watches | [ISSUES.md](ISSUES.md) §2; live Watches are `Frogbot-Watch` / `Source-Code-Watch` |

---

## 10. Quick reference links

| Resource | Path / URL |
| --- | --- |
| Spec (moments, checklist, docs) | [SPEC.md](SPEC.md) |
| Platform / Watch issues (historical `tomjpd`) | [ISSUES.md](ISSUES.md) |
| Lab README | [README.md](README.md) |
| Platform (current) | https://tomjpd2.jfrog.io |
| Risky PR plant branch | `frogbot-risky-pr` (`jsonwebtoken@8.5.1`) |
| Frogbot docs | https://docs.jfrog.com/security/docs/frogbot |
| GitHub Actions integration | https://docs.jfrog.com/security/docs/github-actions |
