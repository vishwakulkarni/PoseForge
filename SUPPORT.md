# PoseForge Support

PoseForge is maintained as an open-source, local-first project. The fastest
way to get useful help is to choose the right GitHub channel and include a
small, reproducible diagnostic report.

## Where to ask

- **Bug:** open a [bug report](https://github.com/vishwakulkarni/PoseForge/issues/new?template=bug_report.yml).
- **Feature idea:** open a [feature request](https://github.com/vishwakulkarni/PoseForge/issues/new?template=feature_request.yml).
- **Setup question or workflow help:** start a [GitHub Discussion](https://github.com/vishwakulkarni/PoseForge/discussions).
- **Security vulnerability:** use a private [GitHub Security Advisory](https://github.com/vishwakulkarni/PoseForge/security/advisories/new). Do not open a public issue.

Before reporting a problem, run `npm run setup` again and check
[Troubleshooting](docs/TROUBLESHOOTING.md).

## What to include

Please include:

- PoseForge version or commit (`git rev-parse --short HEAD`).
- Operating system and CPU architecture.
- `node --version`, `npm --version`, and the configured database mode.
- The selected engine and model, if generation is involved.
- Exact steps to reproduce the problem.
- Expected and actual behavior.
- Relevant terminal or browser-console output.
- Whether the problem occurs after a fresh restart.

For ComfyUI problems, also include the ComfyUI version, model name, relevant
custom-node versions, and a sanitized workflow JSON if it can be shared.

## Protect your data

Never include API keys, authentication tokens, `.env` contents, private
photos, complete database dumps, or unredacted ComfyUI workflows containing
credentials. Replace home-directory paths and personal filenames where they
are not relevant to the problem.

## Support scope

The latest commit on `main` and the latest tagged release are supported.
Maintainers can help with PoseForge itself, but provider account, billing,
quota, model-access, and upstream CLI problems may need to be reported to the
corresponding provider.
