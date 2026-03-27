import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json(null, { status: 401 });

  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json(null, { status: 401 });

  return NextResponse.json(payload);
}
