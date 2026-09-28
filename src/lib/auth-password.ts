import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

function scryptAsync(
  password:string,
  salt:Buffer,
  keyLength:number,
  options:{N:number;r:number;p:number;maxmem:number},
):Promise<Buffer>{
  return new Promise((resolve,reject)=>{
    scrypt(password,salt,keyLength,options,(error,derived)=>{
      if(error) reject(error);
      else resolve(derived);
    });
  });
}
const KEY_LENGTH=64;
const SALT_LENGTH=16;
const COST=16384;
const BLOCK_SIZE=8;
const PARALLELIZATION=1;
const MAX_MEMORY=64*1024*1024;

export async function hashPassword(password:string):Promise<string>{
  const salt=randomBytes(SALT_LENGTH);
  const derived=await scryptAsync(password,salt,KEY_LENGTH,{N:COST,r:BLOCK_SIZE,p:PARALLELIZATION,maxmem:MAX_MEMORY}) as Buffer;
  return ["scrypt",COST,BLOCK_SIZE,PARALLELIZATION,salt.toString("hex"),derived.toString("hex")].join("$");
}

export async function verifyPassword(password:string,encoded:string):Promise<boolean>{
  const parts=encoded.split("$");
  if(parts.length!==6||parts[0]!=="scrypt") return false;

  const cost=Number(parts[1]);
  const blockSize=Number(parts[2]);
  const parallelization=Number(parts[3]);
  const salt=Buffer.from(parts[4],"hex");
  const expected=Buffer.from(parts[5],"hex");
  if(!Number.isSafeInteger(cost)||!Number.isSafeInteger(blockSize)||!Number.isSafeInteger(parallelization)) return false;
  if(!salt.length||!expected.length) return false;

  const derived=await scryptAsync(password,salt,expected.length,{N:cost,r:blockSize,p:parallelization,maxmem:MAX_MEMORY}) as Buffer;
  return derived.length===expected.length&&timingSafeEqual(derived,expected);
}
