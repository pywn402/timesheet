import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getTsProjects, updateTsProject, setProjectArchived } from "@/lib/db";

export async function GET(req: NextRequest) {
  // Archived projects are admin-only — everyone else sees the live list.
  const wantArchived = req.nextUrl.searchParams.get("includeArchived") === "1";
  if (wantArchived) {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const me = token ? await verifyToken(token) : null;
    if (!me?.isAdmin) {
      return NextResponse.json({ error: "無權限" }, { status: 403 });
    }
  }
  const projects = await getTsProjects(wantArchived);
  return NextResponse.json(projects);
}

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const me = token ? await verifyToken(token) : null;
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { id, code, name, archived } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "缺少必要欄位" }, { status: 400 });
  }

  const renaming = code !== undefined || name !== undefined;
  if (renaming) {
    if (!code?.trim() || !name?.trim()) {
      return NextResponse.json({ error: "缺少必要欄位" }, { status: 400 });
    }
    await updateTsProject(Number(id), code.trim(), name.trim());
  }

  if (typeof archived === "boolean") {
    await setProjectArchived(Number(id), archived);
  } else if (!renaming) {
    return NextResponse.json({ error: "缺少必要欄位" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
