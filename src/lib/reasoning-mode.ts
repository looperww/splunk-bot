export type ReasoningEffort="none"|"minimal"|"low"|"medium"|"high"|"xhigh"|"max";

export type ReasoningModeProfile={
  available:boolean;
  toggleAvailable:boolean;
  enabledEffort:ReasoningEffort;
  disabledEffort:ReasoningEffort;
};

const unsupported:ReasoningModeProfile={
  available:false,
  toggleAvailable:false,
  enabledEffort:"medium",
  disabledEffort:"none",
};

function profile(
  disabledEffort:ReasoningEffort,
  enabledEffort:ReasoningEffort="medium",
):ReasoningModeProfile{
  return {
    available:true,
    toggleAvailable:disabledEffort!==enabledEffort,
    enabledEffort,
    disabledEffort,
  };
}

export function reasoningModeProfile(model:string):ReasoningModeProfile{
  const normalized=model.trim().toLowerCase();

  // Pro variants have higher minimum effort than their standard counterparts.
  if(/^gpt-5-pro(?:-|$)/.test(normalized)){
    return {available:true,toggleAvailable:false,enabledEffort:"high",disabledEffort:"high"};
  }
  if(/^gpt-5\.(?:2|4|5)-pro(?:-|$)/.test(normalized)){
    return profile("medium","high");
  }

  if(/^gpt-5\.6(?:-|$)/.test(normalized)||
     /^gpt-5\.5(?:-|$)/.test(normalized)||
     /^gpt-5\.4(?:-|$)/.test(normalized)||
     /^gpt-5\.2(?:-|$)/.test(normalized)||
     /^gpt-5\.1(?:-|$)/.test(normalized)){
    return profile("none");
  }
  if(/^gpt-5\.3-codex(?:-|$)/.test(normalized)){
    return profile("low");
  }
  if(/^gpt-5(?:-|$)/.test(normalized)){
    return profile("minimal");
  }

  if(/^gpt-6(?:-|\.1-)/.test(normalized)){
    if(/^gpt-6-astra(?:-|$)/.test(normalized)||/^gpt-6\.1-sol(?:-|$)/.test(normalized)) return profile("low");
    if(/^gpt-6-(?:sol|luna)(?:-|$)/.test(normalized)) return profile("none");
  }

  // Older o-series reasoning models do not offer a true no-reasoning setting.
  if(/^o[134](?:-|$)/.test(normalized)) return profile("low");

  return unsupported;
}

export function reasoningEffortForModel(
  model:string,
  thinkingEnabled:boolean,
):ReasoningEffort|null{
  const mode=reasoningModeProfile(model);
  if(!mode.available) return null;
  return thinkingEnabled?mode.enabledEffort:mode.disabledEffort;
}
