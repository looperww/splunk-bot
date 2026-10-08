import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { INCIDENT_SCENARIOS } from "@/lib/incident-scenarios";
import {
  DEFAULT_AGENT_DESCRIPTION,
  DEFAULT_AGENT_INSTRUCTIONS,
  DEFAULT_AGENT_NAME,
  DEFAULT_AGENT_PLACEHOLDER,
} from "@/lib/agent-defaults";

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
        max_searches_per_turn INTEGER NOT NULL DEFAULT 6,
        api_key_ciphertext TEXT,
        api_key_iv TEXT,
        api_key_tag TEXT,
        api_key_last4 TEXT NOT NULL DEFAULT '',
        encryption_key_version INTEGER,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE ai_settings
        ADD COLUMN IF NOT EXISTS max_searches_per_turn INTEGER NOT NULL DEFAULT 6;

      CREATE TABLE IF NOT EXISTS abuse_ipdb_settings (
        id TEXT PRIMARY KEY,
        api_key_ciphertext TEXT,
        api_key_iv TEXT,
        api_key_tag TEXT,
        api_key_last4 TEXT NOT NULL DEFAULT '',
        encryption_key_version INTEGER,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS app_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_lower_idx
        ON app_users(LOWER(username));

      CREATE TABLE IF NOT EXISTS app_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx
        ON app_sessions(expires_at);

      CREATE INDEX IF NOT EXISTS app_sessions_user_idx
        ON app_sessions(user_id);

      CREATE TABLE IF NOT EXISTS investigations (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('alert','incident')),
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'ongoing' CHECK (status IN ('ongoing','closed')),
        source_event_id TEXT,
        incident_id TEXT,
        connection_id TEXT REFERENCES splunk_connections(id) ON DELETE SET NULL,
        agent_id TEXT,
        ai_model TEXT,
        think_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        event_context JSONB,
        incident_context JSONB,
        abuse_ipdb JSONB,
        messages JSONB NOT NULL DEFAULT '[]'::jsonb,
        report TEXT NOT NULL DEFAULT '',
        scope JSONB,
        searches JSONB NOT NULL DEFAULT '[]'::jsonb,
        skills JSONB NOT NULL DEFAULT '[]'::jsonb,
        budget JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS investigations_status_idx
        ON investigations(status, updated_at DESC);

      CREATE INDEX IF NOT EXISTS investigations_kind_idx
        ON investigations(kind, updated_at DESC);

      CREATE INDEX IF NOT EXISTS investigations_connection_idx
        ON investigations(connection_id, updated_at DESC);

      ALTER TABLE investigations
        ADD COLUMN IF NOT EXISTS closure_classification TEXT,
        ADD COLUMN IF NOT EXISTS closure_reason TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS ai_model TEXT,
        ADD COLUMN IF NOT EXISTS think_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS abuse_ipdb JSONB;

      CREATE TABLE IF NOT EXISTS investigation_learnings (
        id TEXT PRIMARY KEY,
        connection_id TEXT REFERENCES splunk_connections(id) ON DELETE CASCADE,
        source_investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
        source_event_id TEXT,
        title TEXT NOT NULL,
        detection_family TEXT NOT NULL DEFAULT 'General',
        classification TEXT NOT NULL CHECK (classification IN ('false_positive','critical','high','medium','low')),
        base_severity TEXT NOT NULL DEFAULT 'low' CHECK (base_severity IN ('critical','high','medium','low')),
        reason TEXT NOT NULL,
        scope JSONB NOT NULL DEFAULT '{}'::jsonb,
        supporting_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
        exclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','review','disabled')),
        confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
        support_count INTEGER NOT NULL DEFAULT 1,
        accepted_count INTEGER NOT NULL DEFAULT 0,
        overridden_count INTEGER NOT NULL DEFAULT 0,
        owner_name TEXT NOT NULL DEFAULT '',
        model_name TEXT NOT NULL DEFAULT '',
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(source_investigation_id)
      );

      CREATE INDEX IF NOT EXISTS investigation_learnings_connection_idx
        ON investigation_learnings(connection_id, status, updated_at DESC);

      CREATE INDEX IF NOT EXISTS investigation_learnings_family_idx
        ON investigation_learnings(detection_family, status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS investigation_agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        instructions TEXT NOT NULL DEFAULT '',
        identity_text TEXT NOT NULL DEFAULT '',
        method_text TEXT NOT NULL DEFAULT '',
        guardrails_text TEXT NOT NULL DEFAULT '',
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE investigation_agents
        ADD COLUMN IF NOT EXISTS identity_text TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS method_text TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS guardrails_text TEXT NOT NULL DEFAULT '';

      CREATE TABLE IF NOT EXISTS investigation_skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        path TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        use_when JSONB NOT NULL DEFAULT '[]'::jsonb,
        content TEXT NOT NULL DEFAULT '',
        is_system_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS investigation_skills_default_idx
        ON investigation_skills(is_system_default, name);

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

      CREATE TABLE IF NOT EXISTS ame_event_local_closures (
        connection_id TEXT NOT NULL REFERENCES splunk_connections(id) ON DELETE CASCADE,
        event_id TEXT NOT NULL,
        classification TEXT NOT NULL,
        reason TEXT NOT NULL,
        closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(connection_id, event_id)
      );

      CREATE INDEX IF NOT EXISTS ame_event_local_closures_closed_at_idx
        ON ame_event_local_closures(connection_id, closed_at DESC);

      CREATE TABLE IF NOT EXISTS ame_event_similarity_reviews (
        connection_id TEXT NOT NULL REFERENCES splunk_connections(id) ON DELETE CASCADE,
        event_id TEXT NOT NULL,
        event_fingerprint TEXT NOT NULL,
        history_revision TEXT NOT NULL,
        notifications JSONB NOT NULL DEFAULT '[]'::jsonb,
        warning TEXT,
        checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(connection_id, event_id)
      );

      CREATE INDEX IF NOT EXISTS ame_event_similarity_reviews_checked_idx
        ON ame_event_similarity_reviews(connection_id, checked_at DESC);

      INSERT INTO ame_event_local_closures(connection_id,event_id,classification,reason,closed_at)
      SELECT connection_id,source_event_id,closure_classification,COALESCE(closure_reason,''),updated_at
        FROM (
          SELECT DISTINCT ON (connection_id,source_event_id)
                 connection_id,source_event_id,closure_classification,closure_reason,updated_at
            FROM investigations
           WHERE kind='alert'
             AND status='closed'
             AND connection_id IS NOT NULL
             AND source_event_id IS NOT NULL
             AND closure_classification IS NOT NULL
           ORDER BY connection_id,source_event_id,updated_at DESC
        ) AS closed_alerts
      ON CONFLICT(connection_id,event_id) DO NOTHING;

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

      CREATE TABLE IF NOT EXISTS incident_scenarios (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'General',
        description TEXT NOT NULL DEFAULT '',
        objective TEXT NOT NULL DEFAULT '',
        focus TEXT NOT NULL DEFAULT '',
        target_field_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        time_field_id TEXT,
        fields JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_system_default BOOLEAN NOT NULL DEFAULT FALSE,
        is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS incident_scenarios_enabled_idx
        ON incident_scenarios(is_enabled, category, name);

      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        scenario_id TEXT REFERENCES incident_scenarios(id) ON DELETE SET NULL,
        scenario_name TEXT NOT NULL,
        connection_id TEXT REFERENCES splunk_connections(id) ON DELETE SET NULL,
        ame_event_id TEXT,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        context JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS incidents_created_idx
        ON incidents(created_at DESC);

      CREATE INDEX IF NOT EXISTS incidents_connection_idx
        ON incidents(connection_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS incidents_status_idx
        ON incidents(status, updated_at DESC);

      INSERT INTO investigation_agents(
        id,name,description,instructions,is_default
      ) VALUES(
        'default-soc-agent',
        $agent_name$${DEFAULT_AGENT_NAME}$agent_name$,
        $agent_description$${DEFAULT_AGENT_DESCRIPTION}$agent_description$,
        $agent_instructions$${DEFAULT_AGENT_INSTRUCTIONS}$agent_instructions$,
        TRUE
      ) ON CONFLICT(id) DO UPDATE SET
        name=EXCLUDED.name,
        description=EXCLUDED.description,
        instructions=EXCLUDED.instructions
      WHERE investigation_agents.instructions=$agent_placeholder$${DEFAULT_AGENT_PLACEHOLDER}$agent_placeholder$;


    `);

    // New incident intake creates its investigation explicitly in the API.
    // Do not repeat the historical incident backfill here: an analyst may have
    // intentionally deleted the investigation while retaining the intake row.
    // Re-running the backfill on every process start would resurrect that data.

    for (const scenario of INCIDENT_SCENARIOS) {
      await client.query(
        `INSERT INTO incident_scenarios(
           id,name,category,description,objective,focus,target_field_ids,time_field_id,fields,is_system_default,is_enabled
         ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,TRUE,TRUE)
         ON CONFLICT(id) DO NOTHING`,
        [
          scenario.id,
          scenario.name,
          scenario.category,
          scenario.description,
          scenario.objective,
          scenario.focus,
          JSON.stringify(scenario.targetFieldIds),
          scenario.timeFieldId ?? null,
          JSON.stringify(scenario.fields),
        ],
      );
    }
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
