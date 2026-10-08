import assert from "node:assert/strict";
import test from "node:test";
import { fitModelRequest, modelContextWindowTokens } from "../src/lib/model-context.ts";

test("uses known model context windows and a safe fallback",()=>{
  assert.equal(modelContextWindowTokens("gpt-5.6-luna"),1_050_000);
  assert.equal(modelContextWindowTokens("gpt-5.5"),1_050_000);
  assert.equal(modelContextWindowTokens("gpt-5.4-mini"),400_000);
  assert.equal(modelContextWindowTokens("gpt-5.1-2025-11-13"),400_000);
  assert.equal(modelContextWindowTokens("gpt-4.1"),1_047_576);
  assert.equal(modelContextWindowTokens("some-custom-model"),32_768);
});

test("fits the prompt to the selected model without changing the saved transcript",()=>{
  const originalMessages=Array.from({length:16},(_,index)=>({
    role:index%2===0?"user":"assistant",
    content:`Old detail ${index}: ${"historical investigation evidence ".repeat(380)}`,
  }));
  originalMessages.push({role:"user",content:"Keep this latest question."});
  const originalLatest=originalMessages[originalMessages.length-1].content;
  const input=[{role:"developer",content:"Investigate safely and use the saved scope."},...originalMessages];

  const fitted=fitModelRequest(input,[],"gpt-4");

  assert.ok(fitted.omittedMessages>0);
  assert.equal(fitted.input.at(-1).content,originalLatest);
  assert.ok(fitted.inputTokens+fitted.maxOutputTokens<fitted.contextWindowTokens);
  assert.equal(input.length,originalMessages.length+1);
  assert.equal(input.at(-1).content,originalLatest);
  assert.match(fitted.input[0].content,/complete transcript remains saved/);
});

test("compacts oversized search results while keeping valid tool output",()=>{
  const toolOutput={
    type:"function_call_output",
    call_id:"call-1",
    output:JSON.stringify({
      searchId:"search-1",
      resultCount:40,
      results:Array.from({length:40},(_,index)=>({
        _time:`2026-10-08T10:${String(index).padStart(2,"0")}:00Z`,
        src_ip:`10.0.${Math.floor(index/255)}.${index+1}`,
        details:"large telemetry value ".repeat(160),
      })),
    }),
  };

  const fitted=fitModelRequest([
    {role:"developer",content:"Use evidence carefully."},
    {role:"user",content:"What did the searches show?"},
    toolOutput,
  ],[],"gpt-4");
  const compacted=fitted.input.find((item)=>item?.type==="function_call_output");

  assert.ok(compacted);
  const parsed=JSON.parse(compacted.output);
  assert.equal(parsed.contextTruncated,true);
  assert.equal(parsed.contextCompacted,true);
  assert.equal(parsed.results.length,40);
  assert.ok(parsed.results[0].details.length<160*"large telemetry value ".length);
  assert.ok(fitted.inputTokens+fitted.maxOutputTokens<fitted.contextWindowTokens);
});
