import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentGuardrails, buildAgentPrompt, normalizeSearchLimit, resolveAgentSearchBudget } from "../src/lib/agent.ts";

test("uses the default bounded per-turn investigation budget",()=>{
  assert.deepEqual(resolveAgentSearchBudget(),{
    maxSearchesPerTurn:6,
    maxSearchAttemptsPerTurn:12,
    maxToolRounds:4,
  });
});

test("allows a configured search limit while keeping retries bounded",()=>{
  assert.deepEqual(resolveAgentSearchBudget(9),{
    maxSearchesPerTurn:9,
    maxSearchAttemptsPerTurn:18,
    maxToolRounds:4,
  });
  assert.match(buildAgentGuardrails(resolveAgentSearchBudget(9)),/at most 9 Splunk searches/);
  assert.match(buildAgentGuardrails(resolveAgentSearchBudget(9)),/bounded to 18 attempts/);
  assert.match(buildAgentPrompt({objective:"",target:"",earliest:"",latest:"",dataSources:"",focus:""},[],undefined,undefined,undefined,resolveAgentSearchBudget(9)),/at most 9 Splunk searches/);
});

test("rejects values outside the settings limit",()=>{
  for(const value of [0,13,1.5,"invalid",null]){
    assert.equal(normalizeSearchLimit(value),null);
  }
  assert.equal(normalizeSearchLimit(1),1);
  assert.equal(normalizeSearchLimit(12),12);
});
