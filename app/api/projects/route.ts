import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getTsProjects, updateTsProject } from "@/lib/db";

export async function GET() {
  const projects = await getTsProjects();
  return NextResponse.json(projects);
}

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const me = token ? await verifyToken(token) : null;
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { id, code, name } = await req.json();
  if (!id || !code?.trim() || !name?.trim()) {
    return NextResponse.json({ error: "缺少必要欄位" }, { status: 400 });
  }
  await updateTsProject(Number(id), code.trim(), name.trim());
  return NextResponse.json({ ok: true });
}
