# Repository Guidelines

## Purpose & Baseline

This repository is intended to extend the current OpenCode implementation with user-requested features. Begin each task by identifying the relevant OpenCode source checkout, upstream commit or release, and any installed artifact under investigation. Record the baseline in `docs/upstream.md`; “current” must resolve to a specific version. No application source or toolchain is present yet. Reuse an identified implementation and its conventions rather than creating an unrelated application.

## REA Investigation Workflow

Use `/rea` (the `reverse-engineer-anything` skill) when work depends on shipped artifacts, decompilation, runtime behavior, or differences between source and a distributed build. Read its `SKILL.md` before using it. For ordinary analysis of available source, use repository search and normal coding tools.

- Translate each requested feature into acceptance criteria and identify the existing behavior to preserve.
- Inspect the relevant entry points, state transitions, configuration, and dependencies. Choose REA tools by artifact type; do not assume OpenCode uses Electron or ASAR.
- Reuse existing evidence and start with focused summaries. Record artifact identity, Evidence IDs, observations, inferences, limitations, and unknowns in `docs/investigations/`.
- Use findings to implement changes in maintained source. Keep original artifacts intact and generated analysis outside application modules.
- If REA is unavailable, continue supported source inspection and report the specific blocker. Follow the skill’s recovery workflow before changing tool configuration.

## Project Structure & Development Commands

Preserve the upstream layout, package boundaries, dependency manifests, and lockfiles when source is introduced. Put investigation notes in `docs/investigations/` and setup instructions in `README.md`. Keep credentials and local artifacts out of version control.

Discover install, development, build, lint, and test commands from the actual manifests and upstream documentation. Document verified commands in `README.md`; none are established here yet.

## Coding Style & Testing

Follow upstream naming, indentation, formatting, and lint configuration. Keep feature changes focused and avoid unrelated refactors. Add behavior-based tests using the upstream framework, including regression coverage for affected existing behavior. Run relevant tests and required checks; report unavailable checks explicitly. Validate packaged behavior when the change depends on packaging or runtime integration.

## Commits & Pull Requests

Follow upstream commit conventions once available; otherwise use imperative subjects such as `Add configurable session filters`. Describe the requested feature, baseline version, implementation, validation, and remaining limitations. Link relevant issues and investigation notes; include screenshots for interface changes.
