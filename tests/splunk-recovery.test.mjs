import assert from "node:assert/strict";
import test from "node:test";
import { classifySplunkFailure, SplunkSearchError } from "../src/lib/splunk-recovery.ts";

test("classifies invalid Splunk time bounds for one format recovery",()=>{
  const result=classifySplunkFailure({
    status:400,
    body:JSON.stringify({messages:[{type:"FATAL",text:"Invalid earliest_time."}]}),
  });
  assert.equal(result.category,"invalid_time");
  assert.equal(result.recovery,"retry_time_as_epoch");
  assert.equal(result.diagnostic,"Invalid earliest_time.");
});

test("allows one AI query repair for a recognizable SPL syntax error",()=>{
  const result=classifySplunkFailure({
    status:400,
    body:JSON.stringify({messages:[{type:"FATAL",text:"Error in 'stats' command: invalid argument."}]}),
  });
  assert.equal(result.category,"query_syntax");
  assert.equal(result.recovery,"model_repair_once");
});

test("stops on authentication, authorization, rate-limit, and unknown request errors",()=>{
  for(const [status,category] of [
    [401,"authentication"],
    [403,"authorization"],
    [405,"endpoint"],
    [429,"rate_limited"],
    [400,"request_invalid"],
  ]){
    const result=classifySplunkFailure({status,body:"Request rejected."});
    assert.equal(result.category,category);
    assert.equal(result.recovery,"stop");
  }
});

test("permits one request retry for transient service and fetch failures",()=>{
  assert.equal(classifySplunkFailure({status:503,body:"Service unavailable."}).recovery,"retry_request_once");
  assert.equal(classifySplunkFailure({cause:new TypeError("fetch failed")}).recovery,"retry_request_once");
  assert.equal(classifySplunkFailure({cause:new Error("TimeoutError: request timed out")}).recovery,"retry_request_once");
  assert.equal(classifySplunkFailure({cause:new Error("certificate verify failed")}).recovery,"stop");
});

test("redacts credential-like values from diagnostics",()=>{
  const result=classifySplunkFailure({
    status:400,
    body:JSON.stringify({detail:"invalid query token=abc123 password='sensitive'"}),
  });
  assert.doesNotMatch(result.diagnostic,/abc123|sensitive/);
  assert.match(result.diagnostic,/token=\[redacted\]/);
});

test("keeps the failure category while disabling further retries after the bounded retry",()=>{
  const error=new SplunkSearchError(
    {status:503,body:"Service unavailable."},
    "stop",
    ["Retried once."],
  );
  assert.equal(error.category,"temporary");
  assert.equal(error.recovery,"stop");
  assert.deepEqual(error.recoveryNotes,["Retried once."]);
});
