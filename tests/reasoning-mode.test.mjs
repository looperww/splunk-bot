import assert from "node:assert/strict";
import test from "node:test";
import { reasoningEffortForModel, reasoningModeProfile } from "../src/lib/reasoning-mode.ts";

test("explicitly turns reasoning off for models that support none",()=>{
  assert.equal(reasoningEffortForModel("gpt-5.6-luna",false),"none");
  assert.equal(reasoningEffortForModel("gpt-5.6-luna",true),"medium");
  assert.equal(reasoningEffortForModel("gpt-5.5-2026-01-01",false),"none");
  assert.equal(reasoningEffortForModel("gpt-5.1",false),"none");
});

test("uses the lowest available effort where none is unsupported",()=>{
  assert.equal(reasoningEffortForModel("gpt-5",false),"minimal");
  assert.equal(reasoningEffortForModel("gpt-5.3-codex",false),"low");
  assert.equal(reasoningEffortForModel("o3",false),"low");
  assert.equal(reasoningEffortForModel("gpt-6-astra",false),"low");
  assert.equal(reasoningEffortForModel("gpt-6.1-sol",false),"low");
  assert.equal(reasoningEffortForModel("gpt-6-luna",false),"none");
});

test("disables the control when a model has fixed effort and avoids unsupported models",()=>{
  const fixed=reasoningModeProfile("gpt-5-pro");
  assert.equal(fixed.toggleAvailable,false);
  assert.equal(reasoningEffortForModel("gpt-5-pro",false),"high");
  assert.equal(reasoningEffortForModel("gpt-4.1",false),null);
});

test("shows the model minimum when full disable is unavailable",()=>{
  const profile=reasoningModeProfile("o3-mini");
  assert.equal(profile.disabledEffort,"low");
  assert.equal(profile.toggleAvailable,true);
});
