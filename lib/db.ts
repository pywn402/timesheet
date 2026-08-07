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
    _initialized = initSchema().catch((e) => {
      _initialized = null; // reset so next call retries
      throw e;
    });
  }
  return _initialized;
}

async function initSchema(): Promise<void> {
  const db = getClient();

  await db.execute(`CREATE TABLE IF NOT EXISTS ts_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    UNIQUE(code)
  )`);

  // Migrate older databases created before the `archived` column existed.
  const projCols = (await db.execute(`PRAGMA table_info(ts_projects)`)).rows.map((r) => String(r.name));
  if (!projCols.includes("archived")) {
    await db.execute(`ALTER TABLE ts_projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`);
  }

  await db.execute(`CREATE TABLE IF NOT EXISTS ts_employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    active INTEGER NOT NULL DEFAULT 1
  )`);

  // Migrate older databases created before the `active` column existed.
  const empCols = (await db.execute(`PRAGMA table_info(ts_employees)`)).rows.map((r) => String(r.name));
  if (!empCols.includes("active")) {
    await db.execute(`ALTER TABLE ts_employees ADD COLUMN active INTEGER NOT NULL DEFAULT 1`);
  }

  await db.execute(`CREATE TABLE IF NOT EXISTS ts_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES ts_projects(id),
    employee_id INTEGER NOT NULL REFERENCES ts_employees(id),
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    allocated_hours INTEGER NOT NULL DEFAULT 0,
    UNIQUE(project_id, employee_id, year, month)
  )`);

  // ts_entries: each row is one (project, employee, week, year, month) bucket.
  // A boundary week shared between two months gets two independent rows —
  // one per month — so each month's portion can be edited separately.
  const entryCols = (await db.execute(`PRAGMA table_info(ts_entries)`)).rows.map((r) => String(r.name));
  if (entryCols.length === 0) {
    await db.execute(`CREATE TABLE ts_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES ts_projects(id),
      employee_id INTEGER NOT NULL REFERENCES ts_employees(id),
      week_start TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      actual_hours INTEGER NOT NULL DEFAULT 0,
      UNIQUE(project_id, employee_id, week_start, year, month)
    )`);
  } else if (!entryCols.includes("year")) {
    // Migrate from the old schema (UNIQUE on project/employee/week_start only).
    // Assign each existing entry to the calendar month of its week_start.
    await db.execute(`ALTER TABLE ts_entries RENAME TO ts_entries_old`);
    await db.execute(`CREATE TABLE ts_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES ts_projects(id),
      employee_id INTEGER NOT NULL REFERENCES ts_employees(id),
      week_start TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      actual_hours INTEGER NOT NULL DEFAULT 0,
      UNIQUE(project_id, employee_id, week_start, year, month)
    )`);
    await db.execute(`
      INSERT INTO ts_entries (project_id, employee_id, week_start, year, month, actual_hours)
      SELECT project_id, employee_id, week_start,
             CAST(strftime('%Y', week_start) AS INTEGER),
             CAST(strftime('%m', week_start) AS INTEGER),
             actual_hours
      FROM ts_entries_old
    `);
    await db.execute(`DROP TABLE ts_entries_old`);
  }

  // Seed default employees in fixed display order
  const seedNames = ["Phoebe", "Lu Ju", "Erin", "Natalie", "Tiffany", "Fanny"];
  for (const name of seedNames) {
    await db.execute({ sql: "INSERT OR IGNORE INTO ts_employees (name) VALUES (?)", args: [name] });
  }
}

// ---- Types ----

export interface TsProject {
  id: number;
  code: string;
  name: string;
  archived: boolean;
}

export interface TsEmployee {
  id: number;
  name: string;
  password_hash?: string | null;
  active: boolean;
}

export interface TsEntry {
  id: number;
  project_id: number;
  employee_id: number;
  week_start: string;
  year: number;
  month: number;
  actual_hours: number;
}

// ---- Projects ----

// Returns live projects only by default. Archived projects stay in the DB with
// all their allocations and entries; pass includeArchived to see them.
export async function getTsProjects(includeArchived = false): Promise<TsProject[]> {
  await ensureInit();
  const sql = includeArchived
    ? "SELECT * FROM ts_projects ORDER BY code"
    : "SELECT * FROM ts_projects WHERE archived = 0 ORDER BY code";
  const result = await getClient().execute(sql);
  return result.rows.map((r) => ({
    id: Number(r.id),
    code: String(r.code),
    name: String(r.name),
    archived: Number(r.archived) === 1,
  }));
}

export async function setProjectArchived(id: number, archived: boolean): Promise<void> {
  await ensureInit();
  await getClient().execute({
    sql: "UPDATE ts_projects SET archived = ? WHERE id = ?",
    args: [archived ? 1 : 0, id],
  });
}

export async function createTsProject(code: string, name: string): Promise<number> {
  await ensureInit();
  const db = getClient();
  const existing = await db.execute({ sql: "SELECT id FROM ts_projects WHERE code = ?", args: [code] });
  if (existing.rows.length > 0) {
    // Adding an allocation to an archived project brings it back into view —
    // otherwise the new row would be invisible the moment it was created.
    await db.execute({ sql: "UPDATE ts_projects SET name = ?, archived = 0 WHERE code = ?", args: [name, code] });
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

// Returns active employees only by default; pass includeInactive for
// backend/reporting queries that need departed employees too.
export async function getTsEmployees(includeInactive = false): Promise<TsEmployee[]> {
  await ensureInit();
  const sql = includeInactive
    ? "SELECT * FROM ts_employees ORDER BY id"
    : "SELECT * FROM ts_employees WHERE active = 1 ORDER BY id";
  const result = await getClient().execute(sql);
  return result.rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    password_hash: r.password_hash != null ? String(r.password_hash) : null,
    active: Number(r.active) === 1,
  }));
}

export async function setEmployeeActive(employeeId: number, active: boolean): Promise<void> {
  await ensureInit();
  await getClient().execute({
    sql: "UPDATE ts_employees SET active = ? WHERE id = ?",
    args: [active ? 1 : 0, employeeId],
  });
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
    active: Number(r.active) === 1,
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
    year: Number(r.year),
    month: Number(r.month),
    actual_hours: Number(r.actual_hours),
  }));
}

export async function upsertTsEntry(
  projectId: number,
  employeeId: number,
  weekStart: string,
  year: number,
  month: number,
  hours: number
): Promise<void> {
  await ensureInit();
  await getClient().execute({
    sql: `INSERT INTO ts_entries (project_id, employee_id, week_start, year, month, actual_hours)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(project_id, employee_id, week_start, year, month) DO UPDATE SET actual_hours = excluded.actual_hours`,
    args: [projectId, employeeId, weekStart, year, month, hours],
  });
}
