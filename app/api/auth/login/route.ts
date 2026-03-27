import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getTsEmployeeByName } from "@/lib/db";
import { signToken, COOKIE_NAME } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: "請填寫帳號與密碼" }, { status: 400 });
  }

  const employee = await getTsEmployeeByName(username.trim());

  if (!employee || !employee.password_hash) {
    return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, employee.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
  }

  const token = await signToken({
    employeeId: employee.id,
    name: employee.name,
    isAdmin: employee.name === "Phoebe",
  });

  const res = NextResponse.json({ ok: true, name: employee.name });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
  return res;
}
