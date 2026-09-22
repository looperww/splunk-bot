import crypto from "node:crypto";

const ALGORITHM="aes-256-gcm";
const KEY_VERSION=1;
const KEY_BYTES=32;

function getKey():Buffer{
  const raw=process.env.SPLUNK_TOKEN_ENCRYPTION_KEY;
  if(!raw) throw new Error("SPLUNK_TOKEN_ENCRYPTION_KEY is not configured.");
  try{
    const key=Buffer.from(raw,"base64");
    if(key.length===KEY_BYTES) return key;
  }catch{}
  if(/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw,"hex");
  throw new Error("SPLUNK_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key or 64-character hex key.");
}

export function encryptToken(token:string){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv(ALGORITHM,getKey(),iv);
  const ciphertext=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
  const tag=cipher.getAuthTag();
  return {
    ciphertext:ciphertext.toString("base64"),
    iv:iv.toString("base64"),
    tag:tag.toString("base64"),
    keyVersion:KEY_VERSION,
  };
}

export function decryptToken(input:{
  ciphertext:string;
  iv:string;
  tag:string;
  keyVersion:number;
}):string{
  if(input.keyVersion!==KEY_VERSION){
    throw new Error("Unsupported token encryption key version.");
  }
  const decipher=crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(input.iv,"base64"),
  );
  decipher.setAuthTag(Buffer.from(input.tag,"base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext,"base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function fingerprintToken(token:string):string{
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

export function last4Token(token:string):string{
  return token.slice(-4);
}
