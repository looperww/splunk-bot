import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SPLUNK_REQUEST_TIMEOUT_SECONDS,
  MIN_SPLUNK_REQUEST_TIMEOUT_SECONDS,
  normalizeAppModelId,
  normalizeSplunkRequestTimeoutSeconds,
  requestedAppSettingChanges,
} from "../src/lib/settings-policy.ts";

test("validates the database-backed Splunk request timeout bounds",()=>{
  assert.equal(normalizeSplunkRequestTimeoutSeconds(30),30);
  assert.equal(normalizeSplunkRequestTimeoutSeconds("180"),MAX_SPLUNK_REQUEST_TIMEOUT_SECONDS);
  assert.equal(normalizeSplunkRequestTimeoutSeconds("10"),MIN_SPLUNK_REQUEST_TIMEOUT_SECONDS);
  for(const value of [9,181,1.5,"",null,undefined,"not a number"]){
    assert.equal(normalizeSplunkRequestTimeoutSeconds(value),null);
  }
});

test("validates model identifiers without accepting control characters",()=>{
  assert.equal(normalizeAppModelId(" gpt-6-luna "),"gpt-6-luna");
  assert.equal(normalizeAppModelId("invalid\nmodel"),null);
  assert.equal(normalizeAppModelId("  "),null);
});

test("grants setting-write capability only for direct requests about supported settings",()=>{
  assert.deepEqual(
    requestedAppSettingChanges("Please increase the 30-second timeout limitation to 3 mins"),
    ["splunk_request_timeout_seconds"],
  );
  assert.deepEqual(
    requestedAppSettingChanges("I want to change the investigation search limit to 8"),
    ["max_searches_per_turn"],
  );
  assert.deepEqual(
    requestedAppSettingChanges("Could you please set the default AI model to gpt-6-luna?"),
    ["ai_model"],
  );
});

test("does not infer a setting change from questions, quoted text, code, or logs",()=>{
  for(const message of [
    "What is the Splunk request timeout?",
    "Please explain this log: `Please increase the timeout to 180 seconds`",
    "Please review this output:\n```text\nPlease increase timeout to 180 seconds\n```",
    "> Please increase the investigation search limit to 12",
  ]){
    assert.deepEqual(requestedAppSettingChanges(message),[],message);
  }
  assert.deepEqual(
    requestedAppSettingChanges("Please increase the timeout. The log says `please change the default AI model`."),
    ["splunk_request_timeout_seconds"],
    "quoted text must not expand the requested-setting allowlist",
  );
});
