import assert from "node:assert/strict";
import test from "node:test";
import { closeAmeStatusThroughAllowedTransition } from "../src/lib/ame-status-transition.ts";

test("retries a rejected new-to-closed update through In Progress",async()=>{
  const calls=[];
  const errors=[
    "Selected status closed-id is not valid after new for event abc",
    null,
    null,
  ];
  const result=await closeAmeStatusThroughAllowedTransition(async(statusId,comment)=>{
    calls.push({statusId,comment});
    return errors.shift();
  },"closed-id","in-progress-id","analyst reason");

  assert.equal(result,null);
  assert.deepEqual(calls,[
    {statusId:"closed-id",comment:"analyst reason"},
    {statusId:"in-progress-id",comment:""},
    {statusId:"closed-id",comment:"analyst reason"},
  ]);
});

test("does not add an intermediate update when AME accepts the direct close",async()=>{
  const calls=[];
  const result=await closeAmeStatusThroughAllowedTransition(async(statusId,comment)=>{
    calls.push({statusId,comment});
    return null;
  },"closed-id","in-progress-id","analyst reason");

  assert.equal(result,null);
  assert.deepEqual(calls,[{statusId:"closed-id",comment:"analyst reason"}]);
});

test("stops when AME rejects the transition to In Progress",async()=>{
  const calls=[];
  const result=await closeAmeStatusThroughAllowedTransition(async(statusId,comment)=>{
    calls.push({statusId,comment});
    return statusId==="closed-id"
      ?"Selected status closed-id is not valid after new for event abc"
      :"The intermediate status is invalid.";
  },"closed-id","in-progress-id","analyst reason");

  assert.equal(result,"AME rejected the required transition to In Progress. The intermediate status is invalid.");
  assert.deepEqual(calls,[
    {statusId:"closed-id",comment:"analyst reason"},
    {statusId:"in-progress-id",comment:""},
  ]);
});
