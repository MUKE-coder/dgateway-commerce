# DGateway + Next.js — E-Commerce Integration Guide

A complete example showing how to integrate [DGateway](https://desispay.com) payments into a Next.js application. Supports **Mobile Money** (MTN, Airtel via Iotec/Relworx) and **Card Payments** (via Stripe) through a single unified API.

> **Live demo:** [dgatewayadmin.desispay.com](https://dgateway-commerce.vercel.app)
> **API docs:** [desispay.com/docs](https://desispay.com/docs)
> **WordPress Plugin:** [desispay.com/docs/wordpress](https://desispay.com/docs/wordpress)

---

## What is DGateway?

DGateway is a unified payment and commerce platform for Africa. It lets developers accept mobile money (MTN, Airtel) and card payments through a **single REST API** — no need to integrate each provider separately.

Beyond payments, DGateway also provides tools to sell digital products, courses, templates, and more — all with built-in checkout, webhooks, and a seller dashboard.

---

## Quick Start

### 1. Get your API Key

1. Create a free account at [dgatewayadmin.desispay.com](https://dgatewayadmin.desispay.com)
2. Create an App from the dashboard
3. Go to **API Keys** → Generate a **Live** or **Test** key
4. Your key looks like: `dgw_live_xxxx...` or `dgw_test_xxxx...`

> **Important:** Test keys use sandbox providers. Live keys process real money. Never use live keys during development.

### 2. Clone and install

```bash
git clone https://github.com/MUKE-coder/dgateway.git
cd dgateway/examples/ecommerce-app
npm install
```

### 3. Configure environment

Create a `.env.local` file:

```env
# DGateway API
DGATEWAY_API_URL=https://dgatewayapi.desispay.com
DGATEWAY_API_KEY=dgw_live_your_api_key_here
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3002](http://localhost:3002) to see the store.

---

## Project Structure

```
ecommerce-app/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Product catalog + cart
│   ├── checkout/
│   │   └── page.tsx            # Payment flow (method → processing → result)
│   └── api/
│       └── checkout/
│           ├── route.ts        # POST /api/checkout — initiate payment
│           └── status/
│               └── route.ts    # POST /api/checkout/status — verify payment
├── components/
│   └── zustand-cart.tsx        # Shopping cart with Zustand state management
├── lib/
│   └── dgateway.ts             # Server-side DGateway API client
└── .env.local                  # API credentials (not committed)
```

---

## How It Works

### Architecture Overview

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser    │────▶│  Next.js API      │────▶│  DGateway API   │
│   (React)    │◀────│  Routes (Server)  │◀────│  (Payment Hub)  │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                       │
                                              ┌────────▼────────┐
                                              │  Iotec / Relworx │
                                              │  (Mobile Money)   │
                                              │  Stripe (Cards)   │
                                              └──────────────────┘
```

**Key principle:** Your API key **never** touches the browser. All DGateway API calls happen server-side via Next.js API routes.

---

## Step-by-Step Integration Guide

### Step 1: Create the DGateway Client

Create `lib/dgateway.ts` — a server-side helper that wraps the DGateway API:

```typescript
// lib/dgateway.ts
// Server-side only — never import this in client components

const API_URL = process.env.DGATEWAY_API_URL || "http://localhost:8080";
const API_KEY = process.env.DGATEWAY_API_KEY || "";

interface CollectParams {
  amount: number;
  currency: string;
  phone_number: string;
  provider?: string; // "iotec", "relworx", or "stripe"
  description?: string;
  metadata?: Record<string, unknown>;
}

// Initiate a payment collection
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

// Check transaction status
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
```

> **Docs reference:** [API Authentication](https://desispay.com/docs#authentication)

### Step 2: Create the Checkout API Route

Create `app/api/checkout/route.ts` — this initiates the payment:

```typescript
// app/api/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { collectPayment } from "@/lib/dgateway";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { amount, currency, phone_number, provider, description } = body;

  // Validate required fields
  if (!amount || !currency) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "amount and currency are required",
        },
      },
      { status: 400 },
    );
  }

  // Call DGateway to initiate collection
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
```

> **Docs reference:** [Collect Payments](https://desispay.com/docs#collect)

### Step 3: Create the Status Verification Route

Create `app/api/checkout/status/route.ts` — this checks if payment completed:

```typescript
// app/api/checkout/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyTransaction } from "@/lib/dgateway";

export async function POST(request: NextRequest) {
  const { reference } = await request.json();

  if (!reference) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "reference is required" } },
      { status: 400 },
    );
  }

  const result = await verifyTransaction(reference);
  return NextResponse.json(result);
}
```

> **Docs reference:** [Verify Transactions](https://desispay.com/docs#verify)

### Step 4: Build the Checkout UI

In your checkout component, call the API routes and poll for status:

```typescript
// Initiate payment
const initiatePayment = async () => {
  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: 50000,
      currency: "UGX",
      phone_number: "256770123456",
      provider: "iotec",
      description: "Order #123",
    }),
  });

  const data = await res.json();
  const reference = data.data?.reference;

  // Start polling for payment status
  pollPaymentStatus(reference);
};

// Poll until payment completes or fails
const pollPaymentStatus = async (reference: string) => {
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes at 5-second intervals

  const poll = setInterval(async () => {
    attempts++;
    const res = await fetch("/api/checkout/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference }),
    });

    const data = await res.json();
    const status = data.data?.status;

    if (status === "completed") {
      clearInterval(poll);
      // Show success — payment received!
    } else if (status === "failed") {
      clearInterval(poll);
      // Show error — payment failed
    } else if (attempts >= maxAttempts) {
      clearInterval(poll);
      // Timeout — ask user to try again
    }
  }, 5000);
};
```

---

## Payment Methods

### Mobile Money (Iotec / Relworx)

For MTN and Airtel mobile money payments in East Africa:

```typescript
await collectPayment({
  amount: 50000, // Amount in local currency
  currency: "UGX", // UGX, KES, TZS, RWF
  phone_number: "256770123456", // Format: 256XXXXXXXXX or 0XXXXXXXXX
  provider: "iotec", // or "relworx"
  description: "Order #123",
});
```

**Flow:** User receives a USSD push prompt on their phone → confirms with PIN → payment completes.

**Phone number format:** Must be `256XXXXXXXXX` (12 digits) or `0XXXXXXXXX` (10 digits). No spaces, no `+` prefix.

> **Docs reference:** [Mobile Money Payments](https://desispay.com/docs#mobile-money)

### Card Payments (Stripe)

For Visa, Mastercard, and other card payments:

```typescript
const result = await collectPayment({
  amount: 25, // Amount in card currency
  currency: "USD", // USD, EUR, GBP
  phone_number: "0000000000", // Placeholder for card payments
  provider: "stripe",
  description: "Order #123",
});

// result.data contains:
// - client_secret: Stripe PaymentIntent client secret
// - stripe_publishable_key: Your Stripe publishable key
```

**Flow:** DGateway returns a Stripe `client_secret`. Use `@stripe/react-stripe-js` to render the payment form:

```typescript
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe } from "@stripe/react-stripe-js";

const stripe = await loadStripe(result.data.stripe_publishable_key);

// Wrap your form in <Elements stripe={stripe} options={{ clientSecret }}>
// Use <PaymentElement /> to render the card form
// Call stripe.confirmPayment() on submit
```

> **Docs reference:** [Card Payments](https://desispay.com/docs#stripe)

---

## API Reference

### `POST /v1/payments/collect`

Initiate a payment collection from a customer.

| Parameter      | Type   | Required | Description                                                |
| -------------- | ------ | -------- | ---------------------------------------------------------- |
| `amount`       | number | Yes      | Amount to collect                                          |
| `currency`     | string | Yes      | `UGX`, `KES`, `TZS`, `RWF`, `USD`, `EUR`, `GBP`            |
| `phone_number` | string | Yes      | Customer phone (mobile money) or `0000000000` (cards)      |
| `provider`     | string | No       | `iotec`, `relworx`, or `stripe`. Auto-selected if omitted. |
| `description`  | string | No       | Payment description                                        |
| `metadata`     | object | No       | Custom key-value pairs stored with the transaction         |

**Response:**

```json
{
  "data": {
    "reference": "dgw_abc123",
    "provider_ref": "IOT_xyz789",
    "status": "pending",
    "amount": 50000,
    "currency": "UGX"
  }
}
```

### `POST /v1/webhooks/verify`

Check the current status of a transaction.

| Parameter   | Type   | Required | Description                                     |
| ----------- | ------ | -------- | ----------------------------------------------- |
| `reference` | string | Yes      | Transaction reference from the collect response |

**Response:**

```json
{
  "data": {
    "reference": "dgw_abc123",
    "status": "completed",
    "amount": 50000,
    "currency": "UGX",
    "phone_number": "256770123456",
    "provider": "iotec"
  }
}
```

**Status values:** `pending` → `completed` or `failed`

---

## Webhooks (Recommended)

Instead of polling, you can receive real-time payment notifications via webhooks. Configure your webhook URL in the DGateway dashboard under **Settings → Webhook URL**.

```typescript
// app/api/webhooks/dgateway/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const event = await request.json();

  // Verify the webhook signature (recommended)
  // const signature = request.headers.get("x-webhook-signature");

  if (event.status === "completed") {
    // Payment successful — fulfill the order
    console.log("Payment completed:", event.reference);
    // Update your database, send confirmation email, etc.
  } else if (event.status === "failed") {
    // Payment failed
    console.log("Payment failed:", event.reference, event.failure_reason);
  }

  return NextResponse.json({ received: true });
}
```

> **Docs reference:** [Webhooks](https://desispay.com/docs#webhooks)

---

## Testing

### Test API Keys

Use a **test** API key (`dgw_test_...`) during development. Test transactions don't process real money.

**Test phone number:** `256111777777` — use this with test keys only.

> **Warning:** Never use the test phone number (`256111777777`) with a live API key. This will be rejected by the API.

### Test Providers

| Provider | Test Currency      | Test Phone                  |
| -------- | ------------------ | --------------------------- |
| Iotec    | UGX                | `256111777777`              |
| Relworx  | UGX, KES, TZS, RWF | `256111777777`              |
| Stripe   | USD, EUR, GBP      | Card: `4242 4242 4242 4242` |

---

## Common Errors

| Error                  | Cause                    | Fix                                                      |
| ---------------------- | ------------------------ | -------------------------------------------------------- |
| `INVALID_API_KEY`      | Wrong or missing API key | Check `DGATEWAY_API_KEY` in `.env.local`                 |
| `VALIDATION_ERROR`     | Missing required fields  | Ensure `amount`, `currency`, `phone_number` are provided |
| `PROVIDER_NOT_FOUND`   | Invalid provider slug    | Use `iotec`, `relworx`, or `stripe`                      |
| `INVALID_PHONE`        | Bad phone format         | Use `256XXXXXXXXX` or `0XXXXXXXXX` (digits only)         |
| `INSUFFICIENT_BALANCE` | Provider balance too low | Contact DGateway support                                 |

---

## Deployment

### Environment Variables

Set these in your hosting provider (Vercel, Railway, etc.):

```
DGATEWAY_API_URL=https://dgatewayapi.desispay.com
DGATEWAY_API_KEY=dgw_live_your_production_key
```

### Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
```

Set environment variables in Vercel dashboard → Settings → Environment Variables.

---

## More Resources

- **[DGateway + Next.js Integration Guide](https://jb.desishub.com/blog/dgateway-integration-with-nextjs-guide)** — Detailed step-by-step tutorial with video walkthrough
- **[DGateway Documentation](https://desispay.com/docs)** — Full API reference
- **[WordPress Plugin Guide](https://desispay.com/docs/wordpress)** — WooCommerce integration
- **[DGateway Marketplace](https://dgatewayadmin.desispay.com/marketplace)** — Browse products, courses, and templates
- **[DGateway Blog](https://desispay.com/blog)** — Tutorials and guides
- **[GitHub Repository](https://github.com/MUKE-coder/dgateway)** — Source code and examples
- **[WhatsApp Support](https://chat.whatsapp.com/GhizAUf4WHFFSAVQAwfGiH)** — Community support group

---

## Tech Stack

- **[Next.js 16](https://nextjs.org)** — React framework with App Router
- **[Zustand](https://zustand-demo.pmnd.rs)** — Lightweight state management
- **[Stripe.js](https://stripe.com/docs/stripe-js)** — Card payment UI components
- **[Tailwind CSS 4](https://tailwindcss.com)** — Utility-first CSS
- **[DGateway API](https://desispay.com)** — Unified payment gateway

---

## License

MIT — Use this example as a starting point for your own project.
