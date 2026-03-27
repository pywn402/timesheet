import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getTsEmployeeByName, setEmployeePassword } from "@/lib/db";

// One-time setup endpoint — only works if Phoebe has no password set yet.
// Once a password is set, this endpoint returns 403.
export async function POST(req: NextRequest) {
  const phoebe = await getTsEmployeeByName("Phoebe");

  if (!phoebe) {
    return NextResponse.json({ error: "Admin account not found" }, { status: 404 });
  }

  if (phoebe.password_hash) {
    return NextResponse.json({ error: "Already set up" }, { status: 403 });
  }

  const { password } = await req.json();
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 10);
  await setEmployeePassword(phoebe.id, hash);

  return NextResponse.json({ ok: true });
}
