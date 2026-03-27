import { NextResponse } from "next/server";
import { deleteTsAllocation } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, employeeId, months } = body;
    for (const { year, month } of (months as Array<{ year: number; month: number }>) ?? []) {
      await deleteTsAllocation(projectId, employeeId, year, month);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
