import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool:Pool|undefined;
let schemaReady:Promise<void>|undefined;

function getPool():Pool{
  if(pool) return pool;

  const connectionString=process.env.DATABASE_URL;
  const baseConfig=connectionString
    ?{connectionString}
    :{
        host:process.env.PGHOST,
        port:process.env.PGPORT?Number(process.env.PGPORT):5432,
        database:process.env.PGDATABASE??"splunk_bot",
        user:process.env.PGUSER??"splunk_bot",
        password:process.env.PGPASSWORD,
      };

  if(!connectionString&&!baseConfig.host){
    throw new Error("PostgreSQL connection is not configured.");
  }

  pool=new Pool({
    ...baseConfig,
    max:10,
    idleTimeoutMillis:30000,
    connectionTimeoutMillis:10000,
    ssl:process.env.DATABASE_SSL==="true"?{rejectUnauthorized:process.env.DATABASE_SSL_REJECT_UNAUTHORIZED!=="false"}:undefined,
  });
  return pool;
}

export async function withDb<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await getPool().connect();
  try{return await fn(client);}
  finally{client.release();}
}

export async function query<T extends QueryResultRow=QueryResultRow>(
  text:string,
  values:unknown[]=[],
):Promise<T[]>{
  const result=await getPool().query<T>(text,values);
  return result.rows;
}

async function createSchema():Promise<void>{
  await withDb(async(client)=>{
    await client.query(`
      CREATE TABLE IF NOT EXISTS splunk_connections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        token_ciphertext TEXT NOT NULL,
        token_iv TEXT NOT NULL,
        token_tag TEXT NOT NULL,
        token_last4 TEXT NOT NULL DEFAULT '',
        token_fingerprint TEXT NOT NULL,
        encryption_key_version INTEGER NOT NULL DEFAULT 1,
        username TEXT,
        product_type TEXT,
        version TEXT,
        build TEXT,
        server_name TEXT,
        timezone TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        last_tested_at TIMESTAMPTZ,
        last_discovery_at TIMESTAMPTZ,
        last_error TEXT,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS splunk_connections_token_fp_idx
        ON splunk_connections(token_fingerprint);

      CREATE INDEX IF NOT EXISTS splunk_connections_default_idx
        ON splunk_connections(is_default);

      CREATE TABLE IF NOT EXISTS splunk_connection_roles (
        connection_id TEXT NOT NULL REFERENCES splunk_connections(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        PRIMARY KEY(connection_id, role)
      );

      CREATE TABLE IF NOT EXISTS splunk_connection_capabilities (
        connection_id TEXT NOT NULL REFERENCES splunk_connections(id) ON DELETE CASCADE,
        capability TEXT NOT NULL,
        PRIMARY KEY(connection_id, capability)
      );

      CREATE TABLE IF NOT EXISTS splunk_indexes (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL REFERENCES splunk_connections(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        data_type TEXT,
        disabled BOOLEAN,
        searchable BOOLEAN NOT NULL DEFAULT TRUE,
        event_count_30d BIGINT,
        first_seen TIMESTAMPTZ,
        last_seen TIMESTAMPTZ,
        raw_metadata JSONB,
        discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(connection_id, name)
      );

      CREATE INDEX IF NOT EXISTS splunk_indexes_connection_idx
        ON splunk_indexes(connection_id);

      CREATE TABLE IF NOT EXISTS splunk_sourcetypes (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL REFERENCES splunk_connections(id) ON DELETE CASCADE,
        index_id TEXT REFERENCES splunk_indexes(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        event_count_30d BIGINT,
        first_seen TIMESTAMPTZ,
        last_seen TIMESTAMPTZ,
        raw_metadata JSONB,
        discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(connection_id, index_id, name)
      );

      CREATE INDEX IF NOT EXISTS splunk_sourcetypes_connection_idx
        ON splunk_sourcetypes(connection_id);

      CREATE TABLE IF NOT EXISTS splunk_data_models (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL REFERENCES splunk_connections(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        app TEXT,
        acceleration_enabled BOOLEAN,
        description TEXT,
        raw_metadata JSONB,
        discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(connection_id, name)
      );

      CREATE TABLE IF NOT EXISTS splunk_field_profiles (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL REFERENCES splunk_connections(id) ON DELETE CASCADE,
        index_name TEXT,
        sourcetype_name TEXT,
        fields JSONB NOT NULL,
        discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(connection_id, index_name, sourcetype_name)
      );

      CREATE TABLE IF NOT EXISTS splunk_discovery_runs (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL REFERENCES splunk_connections(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        summary JSONB,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS splunk_discovery_runs_connection_idx
        ON splunk_discovery_runs(connection_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS ai_settings (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL DEFAULT 'mock',
        model TEXT NOT NULL DEFAULT 'gpt-5.6-luna',
        api_key_ciphertext TEXT,
        api_key_iv TEXT,
        api_key_tag TEXT,
        api_key_last4 TEXT NOT NULL DEFAULT '',
        encryption_key_version INTEGER,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS investigation_agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        instructions TEXT NOT NULL DEFAULT '',
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ame_event_cache (
        connection_id TEXT NOT NULL REFERENCES splunk_connections(id) ON DELETE CASCADE,
        event_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT,
        urgency TEXT,
        created_value TEXT,
        owner_name TEXT,
        raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        source_order INTEGER NOT NULL DEFAULT 0,
        cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(connection_id, event_id)
      );

      CREATE INDEX IF NOT EXISTS ame_event_cache_connection_idx
        ON ame_event_cache(connection_id, source_order);

      CREATE TABLE IF NOT EXISTS splunk_alert_cache (
        connection_id TEXT NOT NULL REFERENCES splunk_connections(id) ON DELETE CASCADE,
        alert_id TEXT NOT NULL,
        name TEXT NOT NULL,
        app TEXT,
        owner_name TEXT,
        disabled BOOLEAN NOT NULL DEFAULT FALSE,
        scheduled BOOLEAN NOT NULL DEFAULT FALSE,
        alert_type TEXT,
        cron_schedule TEXT,
        description TEXT,
        raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        source_order INTEGER NOT NULL DEFAULT 0,
        cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(connection_id, alert_id)
      );

      CREATE INDEX IF NOT EXISTS splunk_alert_cache_connection_idx
        ON splunk_alert_cache(connection_id, source_order);

      INSERT INTO investigation_agents(
        id,name,description,instructions,is_default
      ) VALUES(
        'default-soc-agent',
        'SOC Investigation Agent',
        'Evidence-driven defensive investigation agent for Splunk and AME.',
        'Use the governed baseline, pivot, confirmation, and reporting workflow.',
        TRUE
      ) ON CONFLICT(id) DO NOTHING;
    `);
  });
}

export async function ensureSchema():Promise<void>{
  if(schemaReady) return schemaReady;
  schemaReady=createSchema().catch((error)=>{
    schemaReady=undefined;
    throw error;
  });
  return schemaReady;
}
