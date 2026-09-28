import { randomUUID } from "node:crypto";
import { ensureSchema, query } from "@/lib/db";
import {
  buildIncidentContext,
  type IncidentField,
  type IncidentScenario,
} from "@/lib/incident-scenarios";
import type { IncidentContext } from "@/lib/types";

export type StoredIncidentScenario = IncidentScenario & {
  isSystemDefault: boolean;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type IncidentRecord = {
  id: string;
  scenarioId: string | null;
  scenarioName: string;
  connectionId: string | null;
  ameEventId: string | null;
  title: string;
  status: string;
  context: IncidentContext;
  createdAt: string;
  updatedAt: string;
};

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

function fieldsValue(value: unknown): IncidentField[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => (
      Boolean(item) && typeof item === "object"
    ))
    .map((item) => ({
      id: String(item.id ?? ""),
      label: String(item.label ?? ""),
      type: String(item.type ?? "text") as IncidentField["type"],
      required: Boolean(item.required),
      placeholder: item.placeholder == null ? undefined : String(item.placeholder),
      hint: item.hint == null ? undefined : String(item.hint),
      options: Array.isArray(item.options)
        ? item.options.map(String)
        : undefined,
    }))
    .filter((field) => Boolean(field.id) && Boolean(field.label));
}

function mapScenario(row: Record<string, unknown>): StoredIncidentScenario {
  return {
    id: String(row.id),
    name: String(row.name),
    category: String(row.category ?? "General"),
    description: String(row.description ?? ""),
    objective: String(row.objective ?? ""),
    focus: String(row.focus ?? ""),
    targetFieldIds: stringArrayValue(row.target_field_ids),
    timeFieldId: row.time_field_id ? String(row.time_field_id) : undefined,
    fields: fieldsValue(row.fields),
    isSystemDefault: Boolean(row.is_system_default),
    isEnabled: Boolean(row.is_enabled),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapIncident(row: Record<string, unknown>): IncidentRecord {
  const context = row.context && typeof row.context === "object"
    ? row.context as IncidentContext
    : {
        scenarioId: String(row.scenario_id ?? ""),
        scenarioName: String(row.scenario_name ?? ""),
        objective: "",
        focus: "",
        target: "",
        summary: "",
        values: {},
        submittedAt: new Date(String(row.created_at)).toISOString(),
      };

  return {
    id: String(row.id),
    scenarioId: row.scenario_id ? String(row.scenario_id) : null,
    scenarioName: String(row.scenario_name),
    connectionId: row.connection_id ? String(row.connection_id) : null,
    ameEventId: row.ame_event_id ? String(row.ame_event_id) : null,
    title: String(row.title),
    status: String(row.status ?? "open"),
    context,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function normalizeScenarioInput(input: {
  name: string;
  category: string;
  description: string;
  objective: string;
  focus: string;
  targetFieldIds: string[];
  timeFieldId?: string;
  fields: IncidentField[];
}) {
  const name = input.name.trim();
  const category = input.category.trim() || "General";
  const description = input.description.trim();
  const objective = input.objective.trim();
  const focus = input.focus.trim();

  if (!name) throw new Error("Scenario name is required.");
  if (name.length > 160) throw new Error("Scenario name is too long.");
  if (category.length > 100) throw new Error("Scenario category is too long.");
  if (description.length > 2000) throw new Error("Scenario description is too long.");
  if (objective.length > 3000) throw new Error("Scenario objective is too long.");
  if (focus.length > 3000) throw new Error("Scenario focus is too long.");
  if (!input.fields.length) throw new Error("A scenario must contain at least one field.");
  if (input.fields.length > 40) throw new Error("A scenario may contain at most 40 fields.");

  const ids = new Set<string>();
  const fields = input.fields.map((field) => {
    const id = field.id.trim();
    const label = field.label.trim();

    if (!id) throw new Error("Every scenario field needs an ID.");
    if (!label) throw new Error("Every scenario field needs a label.");
    if (id.length > 80) throw new Error("Scenario field ID is too long.");
    if (label.length > 180) throw new Error("Scenario field label is too long.");
    if (ids.has(id)) throw new Error('Duplicate scenario field ID "' + id + '".');
    ids.add(id);

    const type = field.type;
    if (!["text", "textarea", "select", "datetime-local"].includes(type)) {
      throw new Error('Unsupported field type "' + type + '".');
    }

    const options = type === "select"
      ? (field.options ?? []).map((option) => option.trim()).filter(Boolean).slice(0, 20)
      : undefined;

    if (type === "select" && !options?.length) {
      throw new Error('Select field "' + label + '" needs at least one option.');
    }

    return {
      id,
      label,
      type,
      required: Boolean(field.required),
      placeholder: field.placeholder?.trim() || undefined,
      hint: field.hint?.trim() || undefined,
      options,
    };
  });

  const targetFieldIds = [...new Set(
    input.targetFieldIds
      .map((id) => id.trim())
      .filter((id) => ids.has(id)),
  )];

  const timeFieldId = input.timeFieldId?.trim();
  if (timeFieldId && !ids.has(timeFieldId)) {
    throw new Error("The scenario time field must reference an existing field.");
  }

  return {
    name,
    category,
    description,
    objective,
    focus,
    targetFieldIds,
    timeFieldId: timeFieldId || undefined,
    fields,
  };
}

export async function listIncidentScenarios(options: {
  includeDisabled?: boolean;
} = {}): Promise<StoredIncidentScenario[]> {
  await ensureSchema();

  const rows = await query<Record<string, unknown>>(
    options.includeDisabled
      ? "SELECT * FROM incident_scenarios ORDER BY category ASC, name ASC"
      : "SELECT * FROM incident_scenarios WHERE is_enabled=TRUE ORDER BY category ASC, name ASC",
  );

  return rows.map(mapScenario);
}

export async function getIncidentScenarioRecord(
  id: string,
): Promise<StoredIncidentScenario | null> {
  await ensureSchema();
  const rows = await query<Record<string, unknown>>(
    "SELECT * FROM incident_scenarios WHERE id=$1 LIMIT 1",
    [id],
  );
  return rows[0] ? mapScenario(rows[0]) : null;
}

export async function createIncidentScenario(input: {
  name: string;
  category: string;
  description: string;
  objective: string;
  focus: string;
  targetFieldIds: string[];
  timeFieldId?: string;
  fields: IncidentField[];
}): Promise<StoredIncidentScenario> {
  await ensureSchema();

  const normalized = normalizeScenarioInput(input);
  const id = randomUUID();

  await query(
    `INSERT INTO incident_scenarios(
       id,name,category,description,objective,focus,target_field_ids,time_field_id,fields,
       is_system_default,is_enabled
     ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,FALSE,TRUE)`,
    [
      id,
      normalized.name,
      normalized.category,
      normalized.description,
      normalized.objective,
      normalized.focus,
      JSON.stringify(normalized.targetFieldIds),
      normalized.timeFieldId ?? null,
      JSON.stringify(normalized.fields),
    ],
  );

  const scenario = await getIncidentScenarioRecord(id);
  if (!scenario) throw new Error("Failed to read the created incident scenario.");
  return scenario;
}

export async function updateIncidentScenario(
  id: string,
  input: {
    name: string;
    category: string;
    description: string;
    objective: string;
    focus: string;
    targetFieldIds: string[];
    timeFieldId?: string;
    fields: IncidentField[];
  },
): Promise<StoredIncidentScenario> {
  await ensureSchema();

  const normalized = normalizeScenarioInput(input);

  const result = await query<Record<string, unknown>>(
    `UPDATE incident_scenarios
     SET name=$2,category=$3,description=$4,objective=$5,focus=$6,
         target_field_ids=$7::jsonb,time_field_id=$8,fields=$9::jsonb,
         updated_at=NOW()
     WHERE id=$1
     RETURNING *`,
    [
      id,
      normalized.name,
      normalized.category,
      normalized.description,
      normalized.objective,
      normalized.focus,
      JSON.stringify(normalized.targetFieldIds),
      normalized.timeFieldId ?? null,
      JSON.stringify(normalized.fields),
    ],
  );

  if (!result[0]) throw new Error("Incident scenario not found.");
  return mapScenario(result[0]);
}

export async function setIncidentScenarioEnabled(
  id: string,
  enabled: boolean,
): Promise<StoredIncidentScenario> {
  await ensureSchema();

  const result = await query<Record<string, unknown>>(
    `UPDATE incident_scenarios
     SET is_enabled=$2,updated_at=NOW()
     WHERE id=$1
     RETURNING *`,
    [id, enabled],
  );

  if (!result[0]) throw new Error("Incident scenario not found.");
  return mapScenario(result[0]);
}

export async function deleteIncidentScenario(id: string): Promise<void> {
  await ensureSchema();
  const result = await query<{ id: string }>(
    "DELETE FROM incident_scenarios WHERE id=$1 RETURNING id",
    [id],
  );
  if (!result[0]) throw new Error("Incident scenario not found.");
}

export async function createIncident(input: {
  scenario: IncidentScenario;
  values: Record<string, string>;
  connectionId: string;
  ameEventId?: string;
  title?: string;
}): Promise<IncidentRecord> {
  await ensureSchema();

  const id = randomUUID();
  const context = buildIncidentContext(input.scenario, input.values);
  const persistedContext: IncidentContext = {
    ...context,
    incidentId: id,
  };

  const title =
    input.title?.trim() ||
    input.scenario.name +
      (context.target ? " — " + context.target : "");

  await query(
    `INSERT INTO incidents(
       id,scenario_id,scenario_name,connection_id,ame_event_id,title,status,context
     ) VALUES($1,$2,$3,$4,$5,$6,'open',$7::jsonb)`,
    [
      id,
      input.scenario.id,
      input.scenario.name,
      input.connectionId,
      input.ameEventId ?? null,
      title,
      JSON.stringify(persistedContext),
    ],
  );

  return getIncident(id).then((incident) => {
    if (!incident) throw new Error("Failed to read the created incident.");
    return incident;
  });
}

export async function getIncident(id: string): Promise<IncidentRecord | null> {
  await ensureSchema();
  const rows = await query<Record<string, unknown>>(
    "SELECT * FROM incidents WHERE id=$1 LIMIT 1",
    [id],
  );
  return rows[0] ? mapIncident(rows[0]) : null;
}

export async function listIncidents(options: {
  connectionId?: string;
  limit?: number;
} = {}): Promise<IncidentRecord[]> {
  await ensureSchema();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);

  const rows = options.connectionId
    ? await query<Record<string, unknown>>(
        "SELECT * FROM incidents WHERE connection_id=$1 ORDER BY created_at DESC LIMIT $2",
        [options.connectionId, limit],
      )
    : await query<Record<string, unknown>>(
        "SELECT * FROM incidents ORDER BY created_at DESC LIMIT $1",
        [limit],
      );

  return rows.map(mapIncident);
}

export async function updateIncident(
  id: string,
  patch: {
    status?: string;
    title?: string;
  },
): Promise<IncidentRecord> {
  await ensureSchema();

  const title = patch.title?.trim();
  if (title && title.length > 200) throw new Error("Incident title is too long.");

  const result = await query<Record<string, unknown>>(
    `UPDATE incidents
     SET title=COALESCE($2,title),
         status=COALESCE($3,status),
         updated_at=NOW()
     WHERE id=$1
     RETURNING *`,
    [id, title || null, patch.status?.trim() || null],
  );

  if (!result[0]) throw new Error("Incident not found.");
  return mapIncident(result[0]);
}

export async function buildStoredIncidentContext(
  incidentId: string,
): Promise<IncidentContext | null> {
  const incident = await getIncident(incidentId);
  return incident?.context ?? null;
}
