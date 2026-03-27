import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { setEmployeePassword } from "@/lib/db";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const me = token ? await verifyToken(token) : null;

  if (!me?.isAdmin) {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { employeeId, newPassword } = await req.json();

  if (!newPassword || newPassword.length < 6) {
    return NextResponse.json({ error: "密碼至少 6 個字元" }, { status: 400 });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await setEmployeePassword(employeeId, hash);

  return NextResponse.json({ ok: true });
}
