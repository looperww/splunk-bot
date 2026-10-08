import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentGuardrails, buildAgentPrompt, buildGeneralChatPrompt, FOLLOW_UP_SCOPE_PROMPT, normalizeSearchLimit, resolveAgentSearchBudget } from "../src/lib/agent.ts";

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

test("keeps investigation follow-ups conversational and focused",()=>{
  const prompt=buildAgentPrompt({objective:"",target:"",earliest:"",latest:"",dataSources:"",focus:""},[]);
  assert.match(prompt,/conversational investigation partner/);
  assert.match(prompt,/one safe, concrete next diagnostic step/);
  assert.match(prompt,/Do not produce a full formal report in every reply/);
  assert.match(FOLLOW_UP_SCOPE_PROMPT,/treat ordinary follow-ups as part of that same investigation/);
  assert.match(FOLLOW_UP_SCOPE_PROMPT,/Do not reopen intake or ask the analyst to reconfirm scope fields/);
  assert.doesNotMatch(buildAgentGuardrails(),/Finish with these sections/);
});

test("general chat skips investigation scope and exposes safe app and Splunk tools",()=>{
  const prompt=buildGeneralChatPrompt({
    name:"General Chat Agent",
    description:"Open-ended technical troubleshooting.",
    identity:"General assistant.",
    method:"Diagnose collaboratively.",
    instructions:"Follow the user's issue.",
    guardrails:"This chat has no operational tools. It cannot execute shell commands, browse the web, call Splunk, inspect the server, or change application or infrastructure state.",
  });
  assert.match(prompt,/general-purpose AI assistant and collaborative thought partner/);
  assert.match(prompt,/Answer questions across topics/);
  assert.match(prompt,/For ordinary questions, answer from your knowledge/);
  assert.match(prompt,/Use app and Splunk tools only when the question is specifically about this app/);
  assert.match(prompt,/This limits actions, not the topics you can discuss or the advice you can give/);
  assert.match(prompt,/must not narrow the user's allowed topics/);
  assert.match(prompt,/do not force a tool call, Splunk search, alert intake/);
  assert.match(prompt,/query_app_database/);
  assert.match(prompt,/search_app_documentation/);
  assert.match(prompt,/search_app_source/);
  assert.match(prompt,/test_splunk_connection/);
  assert.match(prompt,/connection test is not a login investigation/);
  assert.match(prompt,/search_splunk/);
  assert.match(prompt,/read-only/);
  assert.doesNotMatch(prompt,/at most \d+ Splunk searches/);
});
