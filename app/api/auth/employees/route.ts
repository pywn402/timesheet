import { NextResponse } from "next/server";
import { getTsEmployees } from "@/lib/db";

// Public endpoint — returns employee names only (no password hashes)
export async function GET() {
  const employees = await getTsEmployees();
  return NextResponse.json(employees.map((e) => e.name));
}
