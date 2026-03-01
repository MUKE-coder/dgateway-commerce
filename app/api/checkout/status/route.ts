import { NextRequest, NextResponse } from "next/server";
import { verifyTransaction } from "@/lib/dgateway";

export async function POST(request: NextRequest) {
  const { reference } = await request.json();

  if (!reference) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "reference is required" } },
      { status: 400 }
    );
  }

  const result = await verifyTransaction(reference);
  return NextResponse.json(result);
}
