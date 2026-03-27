import { NextResponse } from "next/server";
import { upsertTsWeeklyPlan, upsertTsEntry, upsertTsAllocation } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, projectId, employeeId, weekStart, year, month, hours } = body;
    const h = typeof hours === "number" ? hours : parseInt(hours ?? "0") || 0;

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
