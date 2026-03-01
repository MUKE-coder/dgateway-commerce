import { NextRequest, NextResponse } from "next/server";
import { collectPayment } from "@/lib/dgateway";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { amount, currency, phone_number, provider, description } = body;

  if (!amount || !currency) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "amount and currency are required" } },
      { status: 400 }
    );
  }

  const result = await collectPayment({
    amount,
    currency,
    phone_number: phone_number || "0000000000",
    provider,
    description,
  });

  if (result.error) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
