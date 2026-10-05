type ErrorShape={
  message?:unknown;
  code?:unknown;
  cause?:unknown;
};

const TLS_CODES=new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

function errorChain(error:unknown):ErrorShape[]{
  const chain:ErrorShape[]=[];
  let current=error;
  for(let index=0;index<4&&current&&typeof current==="object";index++){
    const item=current as ErrorShape;
    chain.push(item);
    current=item.cause;
  }
  return chain;
}

export function describeOutboundFetchError(service:string,error:unknown):string{
  const chain=errorChain(error);
  const code=chain.map((item)=>String(item.code??"")).find(Boolean)??"";
  const detail=chain
    .map((item)=>String(item.message??"").trim())
    .find((message)=>message&&message!=="fetch failed")??"Connection failed before an HTTP response was received";
  const proxyConfigured=Boolean(
    process.env.HTTPS_PROXY||process.env.https_proxy||
    process.env.HTTP_PROXY||process.env.http_proxy,
  );

  let guidance="Check DNS, outbound TCP/443 firewall access, and the server's HTTPS proxy settings.";
  if(TLS_CODES.has(code)){
    guidance="The TLS certificate chain is not trusted. Install the corporate CA in the container and configure NODE_EXTRA_CA_CERTS; do not disable TLS verification.";
  }else if(proxyConfigured&&process.env.NODE_USE_ENV_PROXY!=="1"){
    guidance="Proxy variables are present, but Node proxy support is disabled. Set NODE_USE_ENV_PROXY=1 before starting the application.";
  }else if(code==="ENOTFOUND"||code==="EAI_AGAIN"){
    guidance="DNS resolution failed inside the application container. Check container DNS and proxy configuration.";
  }else if(code==="ECONNREFUSED"||code==="ETIMEDOUT"||code==="UND_ERR_CONNECT_TIMEOUT"){
    guidance="The connection was refused or timed out. Check the outbound firewall and whether HTTPS_PROXY is available inside the container.";
  }

  return `${service} network request failed: ${detail}${code?` (${code})`:""}. ${guidance}`;
}
