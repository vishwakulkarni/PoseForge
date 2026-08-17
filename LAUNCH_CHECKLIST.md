# PoseForge Public Launch Checklist

Goal: make PoseForge easy to discover, install, trust, use, and recommend—especially for developers who use Codex or Google Antigravity (AGS/Gemini).

> Launch gate: do not promote PoseForge broadly until a new user can produce their first successful image in under 15 minutes without personal help.

## Release timeline

Target public launch: **Tuesday, September 1, 2026**, conditional on every
final launch gate below passing by **Tuesday, August 25**. If a gate misses
that date, move the public launch by one week; do not compress beta testing.

| Date | Phase | Owner | Exit criterion |
|---|---|---|---|
| Aug 8 | Release candidate | Maintainer | README media, release notes, changelog, release automation, tests, and production build are green. |
| Aug 9–16 | Clean-install verification | Maintainer + 5 testers | Fresh macOS and Linux clones work; at least 4/5 testers generate an image within 15 minutes without live help. |
| Aug 17 | Gate review | Maintainer | Repeated setup failures are fixed; privacy copy and provider boundaries are rechecked. |
| Aug 18–24 | Private beta and outreach | Maintainer + 10–20 beta users | Five observed installs, five approved transformations, three permissioned testimonials, and creator previews sent. |
| Aug 25 | Go/no-go review | Maintainer | Every item in **Final launch gate** passes and branch protection is restored. |
| Aug 26–30 | Channel preparation | Maintainer | Show HN, Product Hunt, X, LinkedIn, Reddit, and technical article drafts are reviewed and scheduled; community rules checked. |
| Aug 31 | Code freeze and rehearsal | Maintainer | `npm run release:check`, tests, build, clean-clone setup, links, and media all pass from the release commit. |
| Sep 1, 08:00 PT | Publish | Maintainer | Push signed `v0.1.0`; automated workflow publishes GitHub Release and demo assets before any promotional traffic. |
| Sep 1–2 | Launch window | Maintainer | Owned, rented, and borrowed channels publish; questions and issues receive same-day responses. |
| Sep 3–30 | Momentum | Maintainer | One product improvement and one tutorial/benchmark/example ship weekly; adoption metrics are reviewed each Friday. |

Channel order follows the ORB model: activate owned surfaces (repository,
landing page, Discussions) first, rented communities second, and borrowed
creator/newsletter audiences after the release URL is live.

Recalculate the go/no-go score with:

```bash
npm run launch:score
```

Any high-weight blocker means **do not launch**, regardless of the aggregate
score. Update `launch-readiness.json` only from recorded evidence.

## 1. Decide the message

- [x] Use the primary promise: **“Turn the AI subscription you already pay for into a private, local-first photo studio.”**
- [ ] Position Codex CLI as a supported engine only after verifying the complete flow on a clean machine.
- [x] Present Codex CLI and Google Antigravity (AGS/Gemini) as the subscription-powered image-generation paths.
- [x] Keep v0.1.0 focused on Codex CLI and Google Antigravity CLI pose transformation.
- [x] Keep ComfyUI and hosted API adapters behind `POSEFORGE_ENABLE_ADDITIONAL_ENGINES` until a future release.
- [x] Keep ID Photos behind `POSEFORGE_ENABLE_ID_PHOTOS` until a future release.
- [x] Target Codex subscribers and Google Antigravity users first.
- [x] Avoid leading with a long list of providers; lead with the user outcome.

## 2. Make installation effortless

- [x] Create a one-command setup flow with `npm run setup`.
- [x] Make setup create `.env`, install dependencies, start PostgreSQL, run migrations, and verify bundled poses.
- [x] Add clear setup checks and actionable error messages for Node.js, Docker, and PostgreSQL.
- [ ] Support a complete `docker compose up` installation if practical.
- [ ] Test setup from a fresh clone on a clean macOS machine.
- [ ] Test setup from a fresh clone on a clean Linux machine.
- [ ] Ask at least 10 people to install PoseForge without live assistance.
- [ ] Fix every setup problem encountered by more than one tester.
- [ ] Confirm at least 80% of testers reach their first generation without help.

## 3. Improve the GitHub repository

- [x] Make the repository public.
- [x] Add an open-source license.
- [x] Add contribution, security, code-of-conduct, changelog, issue-template, and pull-request-template files.
- [x] Add automated tests and CI workflows.
- [x] Add a concise GitHub description: “Local-first AI pose transformation studio. Transform identity photos using Codex CLI, Google Antigravity, or ComfyUI.”
- [x] Add the project README URL as the GitHub homepage until a separately hosted landing page is available.
- [x] Add repository topics: `codex`, `codex-cli`, `gemini`, `google-antigravity`, `comfyui`, `local-ai`, `local-first`, `generative-ai`, `image-generation`, `pose-transfer`, `photography`, `nodejs`, `react`, and `open-source`.
- [x] Add `SUPPORT.md` with help channels and diagnostic information users should include.
- [x] Add `ROADMAP.md` with near-term, medium-term, and community priorities.
- [x] Add an FAQ and troubleshooting guide.
- [x] Add an operating-system, hardware, and engine compatibility matrix.
- [x] Add an explicit privacy, external-provider, API-key-storage, and telemetry policy.
- [x] Enable GitHub Discussions.
- [ ] Re-enable protection on `main` before launch with strict Node.js 20/22 CI checks, conversation resolution, linear history, and admin enforcement. GitHub API verification on 2026-08-08 returned `Branch not protected`; restore this at the August 25 go/no-go review, after the release changes are merged.
- [x] Enable secret scanning, push protection, Dependabot alerts, security updates, and dependency update PRs.
- [x] Create `good first issue`, `help wanted`, and `dependencies` labels.
- [x] Open six small, well-described starter issues for contributors.

## 4. Rewrite the README for conversion

- [x] Put a 10-second character → pose → transformed-result demo near the top.
- [x] Add a one-sentence explanation of why PoseForge exists.
- [x] Show the shortest working quickstart above detailed documentation.
- [x] State clearly what remains local and what is sent to external providers.
- [x] Add an engine table showing subscription needs, API-key needs, local execution, and external data transfer.
- [x] Add tested platform and supported-provider badges.
- [x] Add links to the landing-page source, documentation, roadmap, support, and Discussions.
- [ ] Add three real, reproducible examples with inputs, outputs, engine, runtime, and hardware. (2 of 3 present; each now has an engine/config/hardware detail table — runtime still unpublished, see section 5)
- [x] Correct the README engine count so the stated number matches the seven engines listed.
- [ ] Ask five developers to review only the first screen and explain what PoseForge does; revise until their answers are accurate.

## 5. Prepare convincing demonstrations

- [x] Produce an individual portrait transformed into a clearly different editorial pose. See `web/public/demo/indian-model-american-poses/`.
- [x] Produce an Indian family with a two-year-old child using an American-family photo only as the pose reference. See `web/public/images/poseforge-indian-family-pose-transfer-v2.webp`.
- [x] Ensure the result preserves the Indian family while visibly adopting the reference composition and body positions.
- [ ] Produce Codex CLI and Google Antigravity (AGS/Gemini) examples using the same inputs for a clear comparison.
- [x] Record a 10-second character/pose/result GIF and MP4 for GitHub, with a reproducible local build script.
- [x] Record a polished 15-second generation walkthrough for launch surfaces. See `demo-output/poseforge-generation-walkthrough-15s.mp4`.
- [ ] Record a five-minute install-to-first-generation YouTube walkthrough.
- [ ] Publish the engine, relevant configuration, hardware, and generation time for every demo. (Engine/config/hardware added to both README examples today; generation time still needs recording from actual runs)
- [ ] Obtain permission before publishing any identifiable user photos.

## 6. Publish the first release

- [x] Choose and document the features included in `v0.1.0`. (Everything under CHANGELOG "Unreleased" ships as v0.1.0; see `CHANGELOG.md` and `RELEASE_NOTES.md`)
- [ ] Complete clean-install verification before tagging the release.
- [x] Write release notes with installation steps, tested platforms, known limitations, and upgrade instructions. See `RELEASE_NOTES.md`.
- [x] Configure demo media attachments for the GitHub Release in `.github/workflows/release.yml` (attachments publish when `v0.1.0` is pushed).
- [x] Add release and CI badges to the README.
- [x] Add tag/version consistency checks and automated release creation. Version and changelog edits remain explicit maintainer decisions.

## 7. Recruit a private beta group

- [ ] Recruit 10–20 Codex and Google Antigravity users.
- [ ] Watch at least five people perform installation without coaching them.
- [ ] Record where each tester gets confused or stops.
- [ ] Collect at least five publishable transformations.
- [ ] Collect at least three honest testimonials with permission and attribution preferences.
- [ ] Ask testers what would make them use PoseForge a second time.
- [ ] Resolve high-frequency setup, privacy, and output-quality objections before launch.

## 8. Prepare platform-specific launch posts

- [x] Prepare a technical **Show HN** post explaining the problem, architecture, local-first boundary, and lessons learned. See `LAUNCH_POSTS.md`.
- [x] Prepare a visual Product Hunt launch with a short video, screenshots, first comment, and FAQ. See `LAUNCH_POSTS.md`.
- [x] Prepare an X/Twitter thread showing the transformation, setup, architecture, and repository link. See `LAUNCH_POSTS.md`.
- [x] Prepare a LinkedIn founder post about making paid AI subscriptions practically useful. See `LAUNCH_POSTS.md`.
- [x] Prepare a Codex-focused post for `r/ChatGPTCoding`. See `LAUNCH_POSTS.md`.
- [x] Prepare a Gemini/Google Antigravity-focused post for relevant Gemini and Google AI communities. See `LAUNCH_POSTS.md`.
- [x] Defer ComfyUI and local-AI community promotion until that engine is enabled in a supported release.
- [x] Prepare an open-source-focused post for `r/opensource`. See `LAUNCH_POSTS.md`.
- [x] Clearly state that v0.1.0 supports the Codex CLI and Google Antigravity subscription-powered paths.
- [ ] Read and follow every community’s self-promotion rules before posting.
- [x] Write distinct posts for each community instead of cross-posting identical promotional copy. See `LAUNCH_POSTS.md`.
- [x] Prepare a Dev.to or Hashnode technical article outline. See `LAUNCH_POSTS.md`.
- [ ] Identify at least 20 relevant AI/open-source newsletters, YouTubers, and community maintainers.
- [ ] Send personal preview messages to selected creators at least one week before launch.
- [ ] Identify relevant “awesome” lists and verify their inclusion requirements.

## 9. Coordinate launch week

- [ ] Pick a launch date when you can personally respond for the full day.
- [ ] Publish GitHub `v0.1.0` before sending promotional traffic.
- [ ] Publish Show HN, Product Hunt, X/Twitter, LinkedIn, Reddit, and YouTube content within a coordinated 48-hour window.
- [ ] Ask beta users to share honest experiences, not scripted praise or coordinated votes.
- [ ] Reply quickly and helpfully to every legitimate question and issue.
- [ ] Convert repeated questions into README or FAQ improvements immediately.
- [ ] Track which channels produce installs and first generations rather than only impressions.
- [ ] Avoid buying stars, exchanging votes, or using artificial engagement.

## 10. Maintain momentum after launch

- [ ] Ship at least one visible improvement each week for the first month.
- [ ] Publish one useful tutorial, workflow, benchmark, or community example each week.
- [ ] Highlight contributor work and user transformations with permission.
- [ ] Keep issue response time below 24 hours during the first month.
- [ ] Hold a monthly roadmap discussion in GitHub Discussions.
- [ ] Submit PoseForge to appropriate awesome lists once setup and documentation meet their standards.
- [ ] Approach AI newsletters, podcasts, YouTubers, and engine communities with concrete user results.
- [ ] Explore desktop packaging only after the command-line setup is reliable.

## 11. Measure real adoption

- [x] Define the north-star activation metric: first successful generation within 15 minutes.
- [ ] Measure landing-page visitors → GitHub visitors.
- [ ] Measure GitHub visitors → stars and clones.
- [ ] Measure clones → successful setup.
- [ ] Measure successful setup → first generation.
- [ ] Measure first generation → returning user or second session.
- [ ] Use privacy-respecting, opt-in analytics or clearly disclose any telemetry.
- [ ] Review acquisition and activation metrics weekly.
- [ ] Treat stars as a distribution signal, not the final product goal.

## First 30-day stretch targets

- [ ] 1,000 GitHub stars.
- [ ] 200 successful installations.
- [ ] 100 users completing a first generation.
- [ ] 20 public user-created examples.
- [ ] 10 external contributors.
- [ ] Less than 24-hour average response time for issues.

## Final launch gate

- [ ] A fresh clone works on clean macOS and Linux environments.
- [ ] Bundled poses are present on a new installation.
- [ ] The landing page and README show the current transformation images rather than stale cached assets.
- [ ] A stranger understands the product from the first README screen.
- [ ] A stranger reaches their first successful generation in under 15 minutes.
- [ ] Privacy and external data transfer are explained accurately.
- [ ] `v0.1.0`, demo media, support paths, and launch posts are ready.
