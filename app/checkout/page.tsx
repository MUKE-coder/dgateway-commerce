"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { ArrowLeft, CheckCircle, CreditCard, Loader2, Phone, XCircle } from "lucide-react";
import { useCartStore } from "@/components/zustand-cart";
import { Button } from "@/components/ui/button";

type PaymentMethod = "iotec" | "stripe" | null;
type PaymentStatus =
  | "idle"
  | "creating"
  | "awaiting_card"
  | "processing"
  | "completed"
  | "failed";

// ─── Stripe Card Form (mounted inside <Elements>) ───────────────────────────

function StripeCardForm({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (error) {
      onError(error.message || "Payment failed");
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      onSuccess();
    } else {
      onSuccess();
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!ready && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
          <span className="ml-2 text-sm text-gray-500">Loading card form...</span>
        </div>
      )}
      <PaymentElement
        onReady={() => setReady(true)}
        onLoadError={(e) => onError(e.error.message || "Failed to load Stripe. Check that STRIPE_PUBLISHABLE_KEY is set correctly.")}
      />
      {ready && (
        <Button
          type="submit"
          disabled={!stripe || submitting}
          className="w-full bg-indigo-600 hover:bg-indigo-700"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            "Pay Now"
          )}
        </Button>
      )}
    </form>
  );
}

// Approximate USD → UGX exchange rate (for demo purposes)
const USD_TO_UGX = 3750;

// ─── Main Checkout Page ──────────────────────────────────────────────────────

export default function CheckoutPage() {
  const router = useRouter();
  const { items, getCartTotalPrice, clearCart } = useCartStore();
  const totalPrice = getCartTotalPrice();
  const totalUGX = Math.round(totalPrice * USD_TO_UGX);

  const [hydrated, setHydrated] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>(null);
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");

  // Iotec
  const [phone, setPhone] = useState("");

  // Stripe
  const [clientSecret, setClientSecret] = useState("");
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  // Wait for Zustand hydration from localStorage
  useEffect(() => setHydrated(true), []);

  // Redirect to home if cart is empty (after hydration)
  useEffect(() => {
    if (hydrated && items.length === 0 && status === "idle") {
      router.push("/");
    }
  }, [hydrated, items.length, status, router]);

  // ─── Poll for payment status ──────────────────────────────────────────────

  const pollStatus = useCallback(
    (ref: string) => {
      let attempts = 0;
      const maxAttempts = 60;

      const poll = async () => {
        if (attempts >= maxAttempts) {
          setError("Payment verification timed out. Check your transaction history.");
          setStatus("failed");
          return;
        }

        attempts++;

        try {
          const res = await fetch("/api/checkout/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference: ref }),
          });
          const data = await res.json();

          if (data.data?.status === "completed") {
            setStatus("completed");
            clearCart();
            return;
          }

          if (data.data?.status === "failed") {
            setError("Payment failed. Please try again.");
            setStatus("failed");
            return;
          }
        } catch {
          // network error — keep polling
        }

        setTimeout(poll, 5000);
      };

      setTimeout(poll, 3000);
    },
    [clearCart]
  );

  // ─── Create payment via DGateway ──────────────────────────────────────────

  const createPayment = async (provider: "iotec" | "stripe", phoneNumber?: string) => {
    setStatus("creating");
    setError("");

    const description = `Order: ${items.map((i) => i.name).join(", ")}`;

    try {
      const isIotec = provider === "iotec";
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: isIotec ? totalUGX : totalPrice,
          currency: isIotec ? "UGX" : "USD",
          phone_number: phoneNumber || "0000000000",
          provider,
          description,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error.message || "Failed to initiate payment");
        setStatus("idle");
        return;
      }

      const ref = data.data.reference;
      setReference(ref);

      if (provider === "stripe") {
        const pubKey = data.data.stripe_publishable_key;
        const secret = data.data.client_secret;
        if (!pubKey || !secret) {
          setError("Stripe is not configured on the server. Please add STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY.");
          setStatus("idle");
          return;
        }
        setClientSecret(secret);
        setStripePromise(loadStripe(pubKey));
        setStatus("awaiting_card");
      } else {
        // Iotec — user confirms on phone, we poll
        setStatus("processing");
        pollStatus(ref);
      }
    } catch {
      setError("Network error. Is the DGateway server running?");
      setStatus("idle");
    }
  };

  // ─── Stripe card success → start polling ──────────────────────────────────

  const handleStripeSuccess = () => {
    setStatus("processing");
    pollStatus(reference);
  };

  // ─── Iotec form submit ────────────────────────────────────────────────────

  const handleIotecSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 9) {
      setError("Enter a valid phone number (at least 9 digits)");
      return;
    }
    createPayment("iotec", phone);
  };

  // ─── Select payment method ────────────────────────────────────────────────

  const selectMethod = (m: PaymentMethod) => {
    setMethod(m);
    setError("");
    setStatus("idle");
    setClientSecret("");
    setStripePromise(null);

    // For Stripe, immediately create the PaymentIntent so Elements can mount
    if (m === "stripe") {
      createPayment("stripe");
    }
  };

  // ─── Loading / empty state ────────────────────────────────────────────────

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // ─── Success state ────────────────────────────────────────────────────────

  if (status === "completed") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
          <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-500" />
          <h1 className="mb-2 text-2xl font-bold text-gray-900">Payment Successful!</h1>
          <p className="mb-1 text-gray-600">Your order has been confirmed.</p>
          <p className="mb-6 text-sm text-gray-400">Reference: {reference}</p>
          <Button onClick={() => router.push("/")} className="bg-green-600 hover:bg-green-700">
            Continue Shopping
          </Button>
        </div>
      </div>
    );
  }

  // ─── Failed state ─────────────────────────────────────────────────────────

  if (status === "failed") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
          <XCircle className="mx-auto mb-4 h-16 w-16 text-red-500" />
          <h1 className="mb-2 text-2xl font-bold text-gray-900">Payment Failed</h1>
          <p className="mb-6 text-gray-600">{error || "Something went wrong."}</p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => router.push("/")}>
              Back to Shop
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setStatus("idle");
                setMethod(null);
                setError("");
              }}
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Processing state (waiting for Iotec confirmation or Stripe polling) ──

  if (status === "processing") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-blue-500" />
          <h1 className="mb-2 text-xl font-bold text-gray-900">Processing Payment...</h1>
          {method === "iotec" ? (
            <p className="text-gray-600">
              A payment prompt has been sent to <span className="font-medium">{phone}</span>.
              <br />
              Please confirm on your phone.
            </p>
          ) : (
            <p className="text-gray-600">Verifying your payment with the provider...</p>
          )}
          <p className="mt-4 text-xs text-gray-400">Reference: {reference}</p>
        </div>
      </div>
    );
  }

  // ─── Main checkout view ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <button
          onClick={() => router.push("/")}
          className="mb-6 flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Shop
        </button>

        <h1 className="mb-6 text-2xl font-bold text-gray-900">Checkout</h1>

        {/* Order Summary */}
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Order Summary</h2>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-gray-900">
                  ${(item.price * item.quantity).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <span className="text-lg font-semibold text-gray-900">Total</span>
            <span className="text-xl font-bold text-green-600">${totalPrice.toFixed(2)}</span>
          </div>
        </div>

        {/* Payment Method Selection */}
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Payment Method</h2>

          <div className="grid grid-cols-2 gap-4">
            {/* Iotec (Mobile Money) */}
            <button
              onClick={() => selectMethod("iotec")}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                method === "iotec"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <Phone
                className={`mb-2 h-6 w-6 ${
                  method === "iotec" ? "text-blue-600" : "text-gray-400"
                }`}
              />
              <p className="font-semibold text-gray-900">Mobile Money</p>
              <p className="text-xs text-gray-500">Pay via Iotec (UGX)</p>
            </button>

            {/* Stripe (Card) */}
            <button
              onClick={() => selectMethod("stripe")}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                method === "stripe"
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <CreditCard
                className={`mb-2 h-6 w-6 ${
                  method === "stripe" ? "text-indigo-600" : "text-gray-400"
                }`}
              />
              <p className="font-semibold text-gray-900">Card Payment</p>
              <p className="text-xs text-gray-500">Pay via Stripe (USD)</p>
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {/* Iotec Form */}
          {method === "iotec" && status === "idle" && (
            <form onSubmit={handleIotecSubmit} className="mt-6 space-y-4">
              <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                UGX {totalUGX.toLocaleString()} (approx. rate: 1 USD = {USD_TO_UGX.toLocaleString()} UGX)
              </div>
              <div>
                <label htmlFor="phone" className="mb-1 block text-sm font-medium text-gray-700">
                  Phone Number
                </label>
                <input
                  id="phone"
                  type="tel"
                  placeholder="e.g. 256771234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-500">Enter with country code (e.g. 256 for Uganda)</p>
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
                Pay UGX {totalUGX.toLocaleString()} with Mobile Money
              </Button>
            </form>
          )}

          {/* Stripe Elements */}
          {method === "stripe" && status === "creating" && (
            <div className="mt-6 flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              <span className="ml-2 text-sm text-gray-500">Initializing card payment...</span>
            </div>
          )}

          {method === "stripe" && status === "awaiting_card" && clientSecret && stripePromise && (
            <div className="mt-6">
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: "stripe",
                    variables: { colorPrimary: "#4f46e5" },
                  },
                }}
              >
                <StripeCardForm
                  onSuccess={handleStripeSuccess}
                  onError={(msg) => setError(msg)}
                />
              </Elements>
            </div>
          )}

          {/* Iotec creating state */}
          {method === "iotec" && status === "creating" && (
            <div className="mt-6 flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span className="ml-2 text-sm text-gray-500">Sending payment request...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
