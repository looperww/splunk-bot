import assert from "node:assert/strict";
import test from "node:test";
import { eventMatchFingerprint } from "../src/lib/event-matching.ts";

function alertInput({id,created,firstSeen,mostRecent,eventTime,dstip="188.114.96.4"}){
  return {
    kind:"alert",
    title:"Outbound connection to IOC IP address",
    eventContext:{
      id,
      title:"Outbound connection to IOC IP address",
      event_id:id,
      eventId:id,
      eventTitle:"Outbound connection to IOC IP address",
      status:"new",
      urgency:"high",
      created,
      owner:"unassigned",
      raw:{
        _key:id,
        first_seen:firstSeen,
        most_recent:mostRecent,
        originQuery:JSON.stringify({query_string:"index=\"bce_fortianalyzer\" | lookup ioc_outbound",query_earliest:firstSeen,query_latest:mostRecent}),
        most_recent_notable_fields:JSON.stringify({_time:eventTime,srcip:"10.63.133.46",dstip,dstport:"443",service:"HTTPS",transport:"tcp",action:"allowed",IOC_DESC:"DCRAT"}),
      },
    },
  };
}

test("matches the same alert when only its embedded most_recent timestamp changes",()=>{
  const earlier=alertInput({id:"6ac66ca9fa04b6f37d0da604",created:"2026-10-07T16:00:34.679Z",firstSeen:"1791388834.67969",mostRecent:"1791388834.67969",eventTime:"1791388253.566278"});
  const later=alertInput({id:"6ac67735fa04b6f37d0da60d",created:"2026-10-07T16:45:31.184Z",firstSeen:"1791391531.18401",mostRecent:"1791391531.18401",eventTime:"1791391148.191733"});

  assert.equal(eventMatchFingerprint(earlier),eventMatchFingerprint(later));
});

test("keeps stable IOC details in the event fingerprint",()=>{
  const original=alertInput({id:"event-a",created:"2026-10-07T16:00:34.679Z",firstSeen:"1791388834.67969",mostRecent:"1791388834.67969",eventTime:"1791388253.566278"});
  const differentIoc=alertInput({id:"event-b",created:"2026-10-07T16:45:31.184Z",firstSeen:"1791391531.18401",mostRecent:"1791391531.18401",eventTime:"1791391148.191733",dstip:"203.0.113.10"});

  assert.notEqual(eventMatchFingerprint(original),eventMatchFingerprint(differentIoc));
});
