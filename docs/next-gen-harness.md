# Next-Gen Autonomous Harness

This workspace is a copied, isolated fork of the existing OpenCodeUI project. The original source at `D:\OpenCode\OpenCodeUI` is intentionally left untouched.

## Goals

- React + Tailwind UI for a full autonomous coding control surface.
- Cookbook module for hardware detection, model recommendation, direct model downloads, and model registration.
- Fallback engine for provider/model failover with state preservation and event logging.
- Autonomous agent loop for plan → act → evaluate → fix → repeat with checkpointing and auto-resume.
- Workspace manager for drive-aware project creation, scaffolding, file tree management, diffs, and logs.
- Pluggable providers for local and cloud inference.

## Module Layout

- `src/modules/cookbook`: hardware scan, model recommendation, download, and registration contracts.
- `src/modules/fallback`: provider/model chain selection, failover events, and active endpoint state.
- `src/modules/agent`: long-running loop controller, checkpoints, and status snapshots.
- `src/modules/workspace`: workspace selection, creation, tree listing, and diff collection.
- `src/providers`: registry for cloud and local providers such as OpenRouter, DeepSeek, Qwen, Gemini, OpenAI, and llama.cpp-style local engines.
- `src/ui/components`: reusable cards, shells, and status badges for the new dashboard UI.

## Data Flow

1. The UI requests a hardware scan through the cookbook module.
2. The cookbook recommends a model family and quantization.
3. The provider registry resolves the best local or cloud endpoint.
4. The fallback engine tracks provider health and switches on failure.
5. The agent loop executes tasks, checkpointing after each stable stage.
6. The workspace manager provides the file tree, diffs, and logs used by the UI.

## Non-Negotiable Boundaries

- Do not edit the original OpenCodeUI source in `D:\OpenCode\OpenCodeUI`.
- Add new features only inside this workspace copy.
- Keep modules pluggable and loosely coupled.
- Prefer explicit state objects and event logs over hidden global state.

## Current Status

- The project has been copied into `D:\Projects\QDance\OpenCodeAutonomous`.
- UI is wired in `src/App.tsx` via a right-side Autonomous drawer toggle button.
- Cookbook hardware scan + recommendation + download UI is implemented in `src/components/HardwareScanPanel.tsx`.
- Provider registry and fallback chain panels are implemented in `src/components/ProviderSelectorPanel.tsx` and `src/components/FallbackChainPanel.tsx`.
- Runtime failover now triggers on real send failures in both chat session sends and the agent loop.
- Agent loop panel is functional and integrated with OpenCode sessions, with checkpoint persistence.
- Workspace manager remains best-effort for scaffolding and still needs production hardening for permission/error handling.

## Remaining Gaps

- Hardware probing is best-effort and depends on desktop shell command availability by platform.
- Model downloads are production-usable but still need cancellation/resume and stronger path/permission UX.
- Fallback retries currently cover send-time provider failures; additional health-check and response-quality policies are still pending.
- Workspace scaffolding flow needs stronger guardrails and richer template lifecycle management.