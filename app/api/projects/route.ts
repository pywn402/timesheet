import { NextRequest, NextResponse } from "next/server";
import { getTsProjects, updateTsProject } from "@/lib/db";

export async function GET() {
  const projects = await getTsProjects();
  return NextResponse.json(projects);
}

export async function PATCH(req: NextRequest) {
  const { id, code, name } = await req.json();
  if (!id || !code?.trim() || !name?.trim()) {
    return NextResponse.json({ error: "缺少必要欄位" }, { status: 400 });
  }
  await updateTsProject(Number(id), code.trim(), name.trim());
  return NextResponse.json({ ok: true });
}
