import { randomUUID } from "node:crypto";
import { ensureSchema, query, withDb } from "@/lib/db";
import { decryptToken, encryptToken, fingerprintToken, last4Token } from "@/lib/secrets";

export type StoredSplunkConnection={
  id:string;
  name:string;
  baseUrl:string;
  username:string|null;
  productType:string|null;
  version:string|null;
  build:string|null;
  serverName:string|null;
  timezone:string|null;
  status:string;
  lastTestedAt:string|null;
  lastDiscoveryAt:string|null;
  lastError:string|null;
  isDefault:boolean;
  tokenLast4:string;
};

export type SplunkConnectionCredentials=StoredSplunkConnection & { token:string };

function mapConnection(row:Record<string,unknown>):StoredSplunkConnection{
  return {
    id:String(row.id),
    name:String(row.name),
    baseUrl:String(row.base_url),
    username:row.username?String(row.username):null,
    productType:row.product_type?String(row.product_type):null,
    version:row.version?String(row.version):null,
    build:row.build?String(row.build):null,
    serverName:row.server_name?String(row.server_name):null,
    timezone:row.timezone?String(row.timezone):null,
    status:String(row.status??"new"),
    lastTestedAt:row.last_tested_at?new Date(String(row.last_tested_at)).toISOString():null,
    lastDiscoveryAt:row.last_discovery_at?new Date(String(row.last_discovery_at)).toISOString():null,
    lastError:row.last_error?String(row.last_error):null,
    isDefault:Boolean(row.is_default),
    tokenLast4:String(row.token_last4??""),
  };
}

async function ready(){await ensureSchema();}

export async function listConnections():Promise<StoredSplunkConnection[]>{
  await ready();
  const rows=await query<Record<string,unknown>>(
    `SELECT * FROM splunk_connections ORDER BY is_default DESC, name ASC`,
  );
  return rows.map(mapConnection);
}

export async function getDefaultConnection():Promise<SplunkConnectionCredentials|null>{
  await ready();
  const rows=await query<Record<string,unknown>>(
    `SELECT * FROM splunk_connections ORDER BY is_default DESC, updated_at DESC LIMIT 1`,
  );
  if(!rows.length) return null;
  return getCredentialsFromRow(rows[0]);
}

export async function getConnection(id:string):Promise<StoredSplunkConnection|null>{
  await ready();
  const rows=await query<Record<string,unknown>>(
    `SELECT * FROM splunk_connections WHERE id=$1 LIMIT 1`,
    [id],
  );
  return rows.length?mapConnection(rows[0]):null;
}

export async function getConnectionCredentials(id:string):Promise<SplunkConnectionCredentials|null>{
  await ready();
  const rows=await query<Record<string,unknown>>(
    `SELECT * FROM splunk_connections WHERE id=$1 LIMIT 1`,
    [id],
  );
  if(!rows.length) return null;
  return getCredentialsFromRow(rows[0]);
}

function getCredentialsFromRow(row:Record<string,unknown>):SplunkConnectionCredentials{
  const base=mapConnection(row);
  return {
    ...base,
    token:decryptToken({
      ciphertext:String(row.token_ciphertext),
      iv:String(row.token_iv),
      tag:String(row.token_tag),
      keyVersion:Number(row.encryption_key_version),
    }),
  };
}

export async function saveConnection(input:{
  name:string;
  baseUrl:string;
  token:string;
  username?:string;
  productType?:string;
  version?:string;
  build?:string;
  serverName?:string;
  timezone?:string;
}):Promise<StoredSplunkConnection>{
  await ready();

  const name=input.name.trim()||"Splunk";
  const baseUrl=new URL(input.baseUrl.trim()).origin;
  const token=input.token.trim();

  if(!token) throw new Error("Splunk token is required.");
  if(token.length>4000) throw new Error("Splunk token is too long.");

  const encrypted=encryptToken(token);
  const fingerprint=fingerprintToken(token);

  const id=randomUUID();

  await withDb(async(client)=>{
    await client.query("UPDATE splunk_connections SET is_default=FALSE");
    await client.query(
      `INSERT INTO splunk_connections (
        id,name,base_url,token_ciphertext,token_iv,token_tag,token_last4,
        token_fingerprint,encryption_key_version,username,product_type,version,
        build,server_name,timezone,status,is_default
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'tested',TRUE
      )`,
      [
        id,name,baseUrl,encrypted.ciphertext,encrypted.iv,encrypted.tag,
        last4Token(token),fingerprint,encrypted.keyVersion,input.username??null,
        input.productType??null,input.version??null,input.build??null,
        input.serverName??null,input.timezone??null,
      ],
    );
  });

  const saved=await getConnection(id);
  if(!saved) throw new Error("Failed to read saved Splunk connection.");
  return saved;
}

export async function updateConnectionTest(
  id:string,
  patch:{
    username?:string;
    productType?:string;
    version?:string;
    build?:string;
    serverName?:string;
    timezone?:string;
    status?:string;
    error?:string|null;
  },
){
  await ready();
  await query(
    `UPDATE splunk_connections
     SET username=COALESCE($2,username),
         product_type=COALESCE($3,product_type),
         version=COALESCE($4,version),
         build=COALESCE($5,build),
         server_name=COALESCE($6,server_name),
         timezone=COALESCE($7,timezone),
         status=COALESCE($8,status),
         last_tested_at=CASE WHEN $8='connected' OR $8='tested' THEN NOW() ELSE last_tested_at END,
         last_error=$9,
         updated_at=NOW()
     WHERE id=$1`,
    [
      id,
      patch.username??null,
      patch.productType??null,
      patch.version??null,
      patch.build??null,
      patch.serverName??null,
      patch.timezone??null,
      patch.status??null,
      patch.error??null,
    ],
  );
}

export async function markDiscovery(
  id:string,
  status:"ready"|"partial"|"failed",
  error?:string|null,
){
  await ready();
  await query(
    `UPDATE splunk_connections
     SET status=$2,last_discovery_at=CASE WHEN $2 IN ('ready','partial') THEN NOW() ELSE last_discovery_at END,
         last_error=$3,updated_at=NOW()
     WHERE id=$1`,
    [id,status,error??null],
  );
}

export async function deleteConnection(id:string){
  await ready();
  await query(`DELETE FROM splunk_connections WHERE id=$1`,[id]);
}
