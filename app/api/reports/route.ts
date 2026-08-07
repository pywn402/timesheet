import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import {
  getTsProjects,
  getTsEmployees,
  getTsAllocationsMultiMonth,
  getTsEntries,
} from "@/lib/db";
import { buildMonthList, getWeeksInMonth } from "@/lib/weeks";

// Always read fresh data — a report must never be served from cache.
export const dynamic = "force-dynamic";

interface ReportMonth {
  year: number;
  month: number;
  allocatedHours: number;
  actualHours: number;
}

interface ReportRow {
  projectId: number;
  projectCode: string;
  projectName: string;
  projectHidden: boolean;
  employeeId: number;
  employeeName: string;
  employeeDeparted: boolean;
  months: ReportMonth[];
  totalAllocated: number;
  totalActual: number;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Reporting view over the whole dataset — unlike /api/timesheets this includes
 * hidden projects and departed employees, each flagged so the caller can tell
 * them apart. Admin only.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const me = token ? await verifyToken(token) : null;
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const now = new Date();
  const startYear = parseInt(sp.get("startYear") ?? String(now.getFullYear()));
  const startMonth = parseInt(sp.get("startMonth") ?? "1");
  const numMonths = Math.min(Math.max(parseInt(sp.get("numMonths") ?? "12"), 1), 24);

  if (!Number.isFinite(startYear) || !Number.isFinite(startMonth) || startMonth < 1 || startMonth > 12) {
    return NextResponse.json({ error: "年月參數不正確" }, { status: 400 });
  }

  // Callers can narrow the report back down if they only want the live view.
  const includeHiddenProjects = sp.get("includeHiddenProjects") !== "0";
  const includeDepartedEmployees = sp.get("includeDepartedEmployees") !== "0";

  const monthList = buildMonthList(startYear, startMonth, numMonths);
  const monthWeeks = new Map(
    monthList.map(({ year, month }) => [`${year}-${month}`, getWeeksInMonth(year, month)])
  );
  const allWeeks = [...new Set([...monthWeeks.values()].flat())];

  const [projects, employees, allocations, entries] = await Promise.all([
    getTsProjects(true),
    getTsEmployees(true),
    getTsAllocationsMultiMonth(monthList),
    getTsEntries(allWeeks),
  ]);

  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const entryMap = new Map(
    entries.map((e) => [`${e.project_id}-${e.employee_id}-${e.week_start}-${e.year}-${e.month}`, e])
  );

  const rowMap = new Map<string, ReportRow>();

  for (const alloc of allocations) {
    const project = projectMap.get(alloc.project_id);
    const employee = employeeMap.get(alloc.employee_id);
    // Orphaned allocation (project or employee row deleted outright) — nothing
    // meaningful to report, and it would show up as a blank line.
    if (!project || !employee) continue;
    if (project.archived && !includeHiddenProjects) continue;
    if (!employee.active && !includeDepartedEmployees) continue;

    const key = `${alloc.project_id}-${alloc.employee_id}`;
    if (!rowMap.has(key)) {
      rowMap.set(key, {
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        projectHidden: project.archived,
        employeeId: employee.id,
        employeeName: employee.name,
        employeeDeparted: !employee.active,
        months: [],
        totalAllocated: 0,
        totalActual: 0,
      });
    }
    const row = rowMap.get(key)!;

    const weeks = monthWeeks.get(`${alloc.year}-${alloc.month}`) ?? [];
    const actualHours = weeks.reduce((sum, week) => {
      const entry = entryMap.get(
        `${alloc.project_id}-${alloc.employee_id}-${week}-${alloc.year}-${alloc.month}`
      );
      return sum + (entry?.actual_hours ?? 0);
    }, 0);

    row.months.push({
      year: alloc.year,
      month: alloc.month,
      allocatedHours: alloc.allocated_hours,
      actualHours,
    });
    row.totalAllocated += alloc.allocated_hours;
    row.totalActual += actualHours;
  }

  const rows = [...rowMap.values()].sort(
    (a, b) =>
      a.projectCode.localeCompare(b.projectCode) || a.employeeName.localeCompare(b.employeeName)
  );
  for (const row of rows) {
    row.months.sort((a, b) => a.year - b.year || a.month - b.month);
  }

  if (sp.get("format") === "csv") {
    const header = [
      "專案代號", "專案名稱", "專案狀態",
      "人員", "人員狀態",
      "年", "月", "計畫工時", "實際工時",
    ];
    const lines = [header.join(",")];
    for (const row of rows) {
      for (const m of row.months) {
        lines.push([
          csvCell(row.projectCode),
          csvCell(row.projectName),
          row.projectHidden ? "已隱藏" : "顯示中",
          csvCell(row.employeeName),
          row.employeeDeparted ? "已離職" : "在職",
          m.year,
          m.month,
          m.allocatedHours,
          m.actualHours,
        ].join(","));
      }
    }
    // BOM so Excel opens the Chinese headers as UTF-8.
    const csv = "﻿" + lines.join("\n");
    const filename = `timesheet-report-${startYear}${String(startMonth).padStart(2, "0")}-${numMonths}m.csv`;
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(
    {
      range: { startYear, startMonth, numMonths, months: monthList },
      includes: { hiddenProjects: includeHiddenProjects, departedEmployees: includeDepartedEmployees },
      summary: {
        rows: rows.length,
        hiddenProjectRows: rows.filter((r) => r.projectHidden).length,
        departedEmployeeRows: rows.filter((r) => r.employeeDeparted).length,
        totalAllocated: rows.reduce((s, r) => s + r.totalAllocated, 0),
        totalActual: rows.reduce((s, r) => s + r.totalActual, 0),
      },
      rows,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
