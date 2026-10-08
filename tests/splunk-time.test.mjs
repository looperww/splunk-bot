import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSplunkTimeBound, normalizeSplunkTimeRange } from "../src/lib/splunk-time.ts";

test("normalizes epoch bounds with explanatory notes into clean UTC timestamps",()=>{
  assert.deepEqual(normalizeSplunkTimeRange(
    "1791371223 (24 hours before alert event time 1791457623)",
    "1791544023 (24 hours after alert event time 1791457623)",
  ),{
    earliest:"2026-10-07T11:07:03.000Z",
    latest:"2026-10-09T11:07:03.000Z",
  });
});

test("normalizes absolute timestamps and keeps supported relative values",()=>{
  assert.equal(normalizeSplunkTimeBound("2026-10-08T11:07:03.481368Z"),"2026-10-08T11:07:03.481Z");
  assert.deepEqual(normalizeSplunkTimeRange("-24h","now"),{earliest:"-24h",latest:"now"});
});

test("rejects prose, invalid dates, and reversed absolute windows",()=>{
  assert.equal(normalizeSplunkTimeBound("24 hours before alert event time 1791457623"),null);
  assert.equal(normalizeSplunkTimeBound("2026-02-30T12:00:00Z"),null);
  assert.equal(normalizeSplunkTimeRange("2026-10-09T11:07:03Z","2026-10-07T11:07:03Z"),null);
});
