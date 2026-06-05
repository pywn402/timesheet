import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { deleteTsAllocation } from "@/lib/db";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const me = token ? await verifyToken(token) : null;
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  try {
    const { projectId, employeeId, months } = await request.json();
    await Promise.all(
      ((months as Array<{ year: number; month: number }>) ?? []).map(({ year, month }) =>
        deleteTsAllocation(projectId, employeeId, year, month)
      )
    );
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
