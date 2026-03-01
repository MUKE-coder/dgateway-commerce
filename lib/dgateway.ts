// Server-side DGateway API client — only used in API routes (not in the browser)

const API_URL = process.env.DGATEWAY_API_URL || "http://localhost:8080";
const API_KEY = process.env.DGATEWAY_API_KEY || "";

interface CollectParams {
  amount: number;
  currency: string;
  phone_number: string;
  provider?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export async function collectPayment(params: CollectParams) {
  const res = await fetch(`${API_URL}/v1/payments/collect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": API_KEY,
    },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function verifyTransaction(reference: string) {
  const res = await fetch(`${API_URL}/v1/webhooks/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": API_KEY,
    },
    body: JSON.stringify({ reference }),
  });
  return res.json();
}
