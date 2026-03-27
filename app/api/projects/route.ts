import { NextResponse } from "next/server";
import { getTsProjects } from "@/lib/db";

export async function GET() {
  const projects = await getTsProjects();
  return NextResponse.json(projects);
}
