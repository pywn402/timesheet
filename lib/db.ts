import { createClient, Client } from "@libsql/client";

let _client: Client | null = null;

function getClient(): Client {
  if (!_client) {
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL ?? "file:./timesheet.db",
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

let _initialized: Promise<void> | null = null;

async function ensureInit(): Promise<void> {
  if (!_initialized) {
    _initialized = initSchema();
  }
  return _initialized;
}

async function initSchema(): Promise<void> {
  const db = getClient();

  await db.execute(`CREATE TABLE IF NOT EXISTS ts_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    UNIQUE(code)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS ts_employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    password_hash TEXT
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS ts_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES ts_projects(id),
    employee_id INTEGER NOT NULL REFERENCES ts_employees(id),
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    allocated_hours INTEGER NOT NULL DEFAULT 0,
    UNIQUE(project_id, employee_id, year, month)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS ts_weekly_plan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES ts_projects(id),
    employee_id INTEGER NOT NULL REFERENCES ts_employees(id),
    week_start TEXT NOT NULL,
    planned_hours INTEGER NOT NULL DEFAULT 0,
    UNIQUE(project_id, employee_id, week_start)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS ts_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES ts_projects(id),
    employee_id INTEGER NOT NULL REFERENCES ts_employees(id),
    week_start TEXT NOT NULL,
    actual_hours INTEGER NOT NULL DEFAULT 0,
    UNIQUE(project_id, employee_id, week_start)
  )`);

  // Seed default employees in fixed display order
  const seedNames = ["Phoebe", "Lu Ju", "Mark", "Wen", "Erin"];
  for (const name of seedNames) {
    await db.execute({ sql: "INSERT OR IGNORE INTO ts_employees (name) VALUES (?)", args: [name] });
  }
}

// ---- Types ----

export interface TsProject {
  id: number;
  code: string;
  name: string;
}

export interface TsEmployee {
  id: number;
  name: string;
  password_hash?: string | null;
}

export interface TsWeeklyPlan {
  id: number;
  project_id: number;
  employee_id: number;
  week_start: string;
  planned_hours: number;
}

export interface TsEntry {
  id: number;
  project_id: number;
  employee_id: number;
  week_start: string;
  actual_hours: number;
}

// ---- Projects ----

export async function getTsProjects(): Promise<TsProject[]> {
  await ensureInit();
  const result = await getClient().execute("SELECT * FROM ts_projects ORDER BY code");
  return result.rows.map((r) => ({ id: Number(r.id), code: String(r.code), name: String(r.name) }));
}

export async function createTsProject(code: string, name: string): Promise<number> {
  await ensureInit();
  const db = getClient();
  const existing = await db.execute({ sql: "SELECT id FROM ts_projects WHERE code = ?", args: [code] });
  if (existing.rows.length > 0) {
    await db.execute({ sql: "UPDATE ts_projects SET name = ? WHERE code = ?", args: [name, code] });
    return Number(existing.rows[0].id);
  }
  const result = await db.execute({ sql: "INSERT INTO ts_projects (code, name) VALUES (?, ?)", args: [code, name] });
  return Number(result.lastInsertRowid);
}

export async function updateTsProject(id: number, code: string, name: string): Promise<void> {
  await ensureInit();
  await getClient().execute({ sql: "UPDATE ts_projects SET code = ?, name = ? WHERE id = ?", args: [code, name, id] });
}

// ---- Employees ----

export async function getTsEmployees(): Promise<TsEmployee[]> {
  await ensureInit();
  const result = await getClient().execute("SELECT * FROM ts_employees ORDER BY id");
  return result.rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    password_hash: r.password_hash != null ? String(r.password_hash) : null,
  }));
}

export async function getTsEmployeeByName(name: string): Promise<TsEmployee | null> {
  await ensureInit();
  const result = await getClient().execute({ sql: "SELECT * FROM ts_employees WHERE name = ?", args: [name] });
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    id: Number(r.id),
    name: String(r.name),
    password_hash: r.password_hash != null ? String(r.password_hash) : null,
  };
}

export async function setEmployeePassword(employeeId: number, hash: string): Promise<void> {
  await ensureInit();
  await getClient().execute({ sql: "UPDATE ts_employees SET password_hash = ? WHERE id = ?", args: [hash, employeeId] });
}

export async function createTsEmployee(name: string): Promise<number> {
  await ensureInit();
  const db = getClient();
  const existing = await db.execute({ sql: "SELECT id FROM ts_employees WHERE name = ?", args: [name] });
  if (existing.rows.length > 0) return Number(existing.rows[0].id);
  const result = await db.execute({ sql: "INSERT INTO ts_employees (name) VALUES (?)", args: [name] });
  return Number(result.lastInsertRowid);
}

// ---- Allocations ----

export async function getTsAllocationsMultiMonth(
  months: Array<{ year: number; month: number }>
): Promise<Array<{ id: number; project_id: number; employee_id: number; year: number; month: number; allocated_hours: number }>> {
  if (months.length === 0) return [];
  await ensureInit();
  const conditions = months.map(() => "(year = ? AND month = ?)").join(" OR ");
  const args = months.flatMap(({ year, month }) => [year, month]);
  const result = await getClient().execute({
    sql: `SELECT * FROM ts_allocations WHERE ${conditions} ORDER BY project_id, employee_id, year, month`,
    args,
  });
  return result.rows.map((r) => ({
    id: Number(r.id),
    project_id: Number(r.project_id),
    employee_id: Number(r.employee_id),
    year: Number(r.year),
    month: Number(r.month),
    allocated_hours: Number(r.allocated_hours),
  }));
}

export async function upsertTsAllocation(
  projectId: number,
  employeeId: number,
  year: number,
  month: number,
  hours: number
): Promise<void> {
  await ensureInit();
  await getClient().execute({
    sql: `INSERT INTO ts_allocations (project_id, employee_id, year, month, allocated_hours)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(project_id, employee_id, year, month) DO UPDATE SET allocated_hours = excluded.allocated_hours`,
    args: [projectId, employeeId, year, month, hours],
  });
}

export async function deleteTsAllocation(
  projectId: number,
  employeeId: number,
  year: number,
  month: number
): Promise<void> {
  await ensureInit();
  await getClient().execute({
    sql: "DELETE FROM ts_allocations WHERE project_id = ? AND employee_id = ? AND year = ? AND month = ?",
    args: [projectId, employeeId, year, month],
  });
}

// ---- Weekly Plan ----

export async function getTsWeeklyPlans(weekStarts: string[]): Promise<TsWeeklyPlan[]> {
  if (weekStarts.length === 0) return [];
  await ensureInit();
  const placeholders = weekStarts.map(() => "?").join(",");
  const result = await getClient().execute({
    sql: `SELECT * FROM ts_weekly_plan WHERE week_start IN (${placeholders})`,
    args: weekStarts,
  });
  return result.rows.map((r) => ({
    id: Number(r.id),
    project_id: Number(r.project_id),
    employee_id: Number(r.employee_id),
    week_start: String(r.week_start),
    planned_hours: Number(r.planned_hours),
  }));
}

export async function upsertTsWeeklyPlan(
  projectId: number,
  employeeId: number,
  weekStart: string,
  hours: number
): Promise<void> {
  await ensureInit();
  await getClient().execute({
    sql: `INSERT INTO ts_weekly_plan (project_id, employee_id, week_start, planned_hours)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(project_id, employee_id, week_start) DO UPDATE SET planned_hours = excluded.planned_hours`,
    args: [projectId, employeeId, weekStart, hours],
  });
}

// ---- Entries (Actual Hours) ----

export async function getTsEntries(weekStarts: string[]): Promise<TsEntry[]> {
  if (weekStarts.length === 0) return [];
  await ensureInit();
  const placeholders = weekStarts.map(() => "?").join(",");
  const result = await getClient().execute({
    sql: `SELECT * FROM ts_entries WHERE week_start IN (${placeholders})`,
    args: weekStarts,
  });
  return result.rows.map((r) => ({
    id: Number(r.id),
    project_id: Number(r.project_id),
    employee_id: Number(r.employee_id),
    week_start: String(r.week_start),
    actual_hours: Number(r.actual_hours),
  }));
}

export async function upsertTsEntry(
  projectId: number,
  employeeId: number,
  weekStart: string,
  hours: number
): Promise<void> {
  await ensureInit();
  await getClient().execute({
    sql: `INSERT INTO ts_entries (project_id, employee_id, week_start, actual_hours)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(project_id, employee_id, week_start) DO UPDATE SET actual_hours = excluded.actual_hours`,
    args: [projectId, employeeId, weekStart, hours],
  });
}
