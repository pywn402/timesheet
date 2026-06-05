import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { upsertTsWeeklyPlan, upsertTsEntry, upsertTsAllocation } from "@/lib/db";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const me = token ? await verifyToken(token) : null;
  if (!me) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, projectId, employeeId, weekStart, year, month, hours } = body;
    const h = typeof hours === "number" ? hours : parseInt(hours ?? "0") || 0;

    // Non-admins can only save their own actual hours
    if (!me.isAdmin && me.employeeId !== employeeId) {
      return NextResponse.json({ error: "無權限" }, { status: 403 });
    }
    // Only admins can set allocations
    if (type === "allocation" && !me.isAdmin) {
      return NextResponse.json({ error: "無權限" }, { status: 403 });
    }

    if (type === "plan" && weekStart) {
      await upsertTsWeeklyPlan(projectId, employeeId, weekStart, h);
    } else if (type === "actual" && weekStart) {
      await upsertTsEntry(projectId, employeeId, weekStart, h);
    } else if (type === "allocation" && year && month) {
      await upsertTsAllocation(projectId, employeeId, year, month, h);
    } else {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
