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

export interface MonthInfo {
  year: number;
  month: number;
  weeks: string[];
}

/**
 * Returns all week-start Mondays (YYYY-MM-DD) for a given calendar month.
 *
 * First-Monday rule:
 *   - If the 1st falls Mon–Fri: include the Monday of that week (may be in the prev month).
 *   - If the 1st falls Sat–Sun: start from the first Monday inside the month.
 *
 * Last Monday = the Monday on or before the last day of the month.
 */
function getWeeksInMonth(year: number, month: number): string[] {
  const weeks: string[] = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay  = new Date(year, month, 0);

  // --- first Monday ---
  const firstDow = firstDay.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const firstMonday = new Date(firstDay);
  if (firstDow >= 1 && firstDow <= 5) {
    // Mon–Fri: step back to that week's Monday
    firstMonday.setDate(firstDay.getDate() - (firstDow - 1));
  } else {
    // Sat(6) or Sun(0): first Monday in the month
    firstMonday.setDate(firstDay.getDate() + (firstDow === 0 ? 1 : 2));
  }

  // --- last Monday (Monday on or before last day) ---
  const lastDow = lastDay.getDay();
  const lastMonday = new Date(lastDay);
  lastMonday.setDate(lastDay.getDate() - (lastDow === 0 ? 6 : lastDow - 1));

  // --- collect ---
  const current = new Date(firstMonday);
  while (current <= lastMonday) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    const d = String(current.getDate()).padStart(2, "0");
    weeks.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 7);
  }
  return weeks;
}

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

// Always read fresh data — avoid edge/CDN caching serving stale results to other users
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const startYear = parseInt(searchParams.get("startYear") ?? String(now.getFullYear()));
  const startMonth = parseInt(searchParams.get("startMonth") ?? String(now.getMonth() + 1));
  const numMonths = Math.min(parseInt(searchParams.get("numMonths") ?? "12"), 12);

  // Build month list
  const monthList: Array<{ year: number; month: number }> = [];
  let cur = { year: startYear, month: startMonth };
  for (let i = 0; i < numMonths; i++) {
    monthList.push(cur);
    cur = nextMonth(cur.year, cur.month);
  }

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
  const entryMap = new Map(entries.map((e) => [`${e.project_id}-${e.employee_id}-${e.week_start}`, e]));
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
      const entry = entryMap.get(`${alloc.project_id}-${alloc.employee_id}-${week}`);
      weeklyActual[week] = entry?.actual_hours ?? 0;
    }

    row.monthData[monthKey] = { allocatedHours: alloc.allocated_hours, weeklyActual };
  }

  const rows = Array.from(rowMap.values()).map((row) => {
    const totalAllocated = Object.values(row.monthData).reduce((s, m) => s + m.allocatedHours, 0);
    // Boundary weeks are shared between two adjacent months' monthData —
    // dedupe by week_start so those hours aren't counted twice.
    const weekHours = new Map<string, number>();
    for (const m of Object.values(row.monthData)) {
      for (const [week, hrs] of Object.entries(m.weeklyActual)) {
        weekHours.set(week, hrs);
      }
    }
    const totalActual = Array.from(weekHours.values()).reduce((a, b) => a + b, 0);
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
