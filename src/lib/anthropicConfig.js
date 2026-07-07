// anthropicConfig.js — single source of truth for the Claude model.
//
// July 7 postmortem: claude-sonnet-4-20250514 was retired June 15, 2026 and
// prod scanning 404'd silently for three weeks, partly because the model ID
// was duplicated across routes. One env var now flips it everywhere.
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
