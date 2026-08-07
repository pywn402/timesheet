import { NextResponse } from "next/server";
import {
  getTsProjects,
  getTsEmployees,
  getTsAllocationsMultiMonth,
  getTsEntries,
  createTsProject,
  createTsEmployee,
  upsertTsAllocation,
} from "@/lib/db";
import { buildMonthList, getWeeksInMonth, nextMonth, type MonthInfo } from "@/lib/weeks";

export type { MonthInfo } from "@/lib/weeks";

// Always read fresh data — avoid edge/CDN caching serving stale results to other users
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const startYear = parseInt(searchParams.get("startYear") ?? String(now.getFullYear()));
  const startMonth = parseInt(searchParams.get("startMonth") ?? String(now.getMonth() + 1));
  const numMonths = Math.min(parseInt(searchParams.get("numMonths") ?? "12"), 12);

  const monthList = buildMonthList(startYear, startMonth, numMonths);

  const monthInfos: MonthInfo[] = monthList.map(({ year, month }) => ({
    year,
    month,
    weeks: getWeeksInMonth(year, month),
  }));

  const allWeeks = monthInfos.flatMap((m) => m.weeks);
  const [projects, employees, allocations, entries] = await Promise.all([
    getTsProjects(),
    getTsEmployees(),
    getTsAllocationsMultiMonth(monthList),
    getTsEntries(allWeeks),
  ]);

  // O(1) lookup maps
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const entryMap = new Map(entries.map((e) => [`${e.project_id}-${e.employee_id}-${e.week_start}-${e.year}-${e.month}`, e]));
  const monthInfoMap = new Map(monthInfos.map((mi) => [`${mi.year}-${mi.month}`, mi]));

  // Group by project+employee
  const rowMap = new Map<string, {
    projectId: number;
    projectCode: string;
    projectName: string;
    employeeId: number;
    employeeName: string;
    monthData: Record<string, { allocatedHours: number; weeklyActual: Record<string, number> }>;
  }>();

  for (const alloc of allocations) {
    // Skip departed employees and archived projects — their allocations stay in
    // the DB but are not part of the timesheet view.
    if (!employeeMap.has(alloc.employee_id)) continue;
    if (!projectMap.has(alloc.project_id)) continue;

    const key = `${alloc.project_id}-${alloc.employee_id}`;
    if (!rowMap.has(key)) {
      const project = projectMap.get(alloc.project_id);
      const employee = employeeMap.get(alloc.employee_id);
      rowMap.set(key, {
        projectId: alloc.project_id,
        projectCode: project?.code ?? "",
        projectName: project?.name ?? "",
        employeeId: alloc.employee_id,
        employeeName: employee?.name ?? "",
        monthData: {},
      });
    }

    const row = rowMap.get(key)!;
    const monthKey = `${alloc.year}-${alloc.month}`;
    const monthInfo = monthInfoMap.get(monthKey);

    const weeklyActual: Record<string, number> = {};
    for (const week of monthInfo?.weeks ?? []) {
      const entry = entryMap.get(`${alloc.project_id}-${alloc.employee_id}-${week}-${alloc.year}-${alloc.month}`);
      weeklyActual[week] = entry?.actual_hours ?? 0;
    }

    row.monthData[monthKey] = { allocatedHours: alloc.allocated_hours, weeklyActual };
  }

  const rows = Array.from(rowMap.values()).map((row) => {
    const totalAllocated = Object.values(row.monthData).reduce((s, m) => s + m.allocatedHours, 0);
    const totalActual = Object.values(row.monthData).reduce(
      (s, m) => s + Object.values(m.weeklyActual).reduce((a, b) => a + b, 0),
      0
    );
    return { ...row, totalAllocated, totalActual };
  });

  return NextResponse.json(
    { months: monthInfos, rows, employees },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectCode, projectName, employeeName, startYear, startMonth, numMonths } = body;

    if (!projectCode || !projectName || !employeeName || !startYear || !startMonth) {
      return NextResponse.json({ error: "請填寫所有必填欄位" }, { status: 400 });
    }

    const projectId = await createTsProject(projectCode, projectName);
    const employeeId = await createTsEmployee(employeeName);

    let cur = { year: startYear, month: startMonth };
    const n = Math.min(numMonths ?? 12, 12);
    for (let i = 0; i < n; i++) {
      await upsertTsAllocation(projectId, employeeId, cur.year, cur.month, 0);
      cur = nextMonth(cur.year, cur.month);
    }

    return NextResponse.json({ success: true, projectId, employeeId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
