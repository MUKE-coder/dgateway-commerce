"use client";

import { Heart, Minus, Plus, ShoppingCart, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { Button } from "@/components/ui/button";

// Types
interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  categoryId?: string;
}

interface CartItem extends Product {
  quantity: number;
}

interface CartState {
  items: CartItem[];
  addToCart: (product: Product) => void;
  incrementQuantity: (productId: string) => void;
  decrementQuantity: (productId: string) => void;
  removeFromCart: (productId: string) => void;
  getCartTotalItems: () => number;
  getCartTotalPrice: () => number;
  clearCart: () => void;
}

// Sample product data with Unsplash images
const sampleProducts: Product[] = [
  {
    id: "1",
    name: "Premium Headphones",
    description:
      "Noise-cancelling wireless headphones with exceptional sound quality and comfort.",
    price: 199.99,
    image:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
    categoryId: "electronics",
  },
  {
    id: "2",
    name: "Smart Watch Series 5",
    description:
      "Advanced smartwatch with health monitoring, GPS, and long battery life.",
    price: 249.99,
    image:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
    categoryId: "electronics",
  },
  {
    id: "3",
    name: "Designer Backpack",
    description:
      "Durable and stylish backpack with multiple compartments and laptop sleeve.",
    price: 89.99,
    image:
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
    categoryId: "fashion",
  },
];

// Zustand store for cart management
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addToCart: (product) => {
        set((state) => {
          const existingItem = state.items.find(
            (item) => item.id === product.id
          );
          if (existingItem) {
            return {
              items: state.items.map((item) =>
                item.id === product.id
                  ? { ...item, quantity: item.quantity + 1 }
                  : item
              ),
            };
          } else {
            return {
              items: [...state.items, { ...product, quantity: 1 }],
            };
          }
        });
      },
      incrementQuantity: (productId) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === productId
              ? { ...item, quantity: item.quantity + 1 }
              : item
          ),
        }));
      },
      decrementQuantity: (productId) => {
        set((state) => ({
          items: state.items
            .map((item) =>
              item.id === productId
                ? { ...item, quantity: Math.max(0, item.quantity - 1) }
                : item
            )
            .filter((item) => item.quantity > 0),
        }));
      },
      removeFromCart: (productId) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== productId),
        }));
      },
      getCartTotalItems: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      },
      getCartTotalPrice: () => {
        return get().items.reduce(
          (total, item) => total + item.price * item.quantity,
          0
        );
      },
      clearCart: () => {
        set({ items: [] });
      },
    }),
    {
      name: "ecommerce-cart-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Product Card Component
interface ProductCardProps {
  product: Product;
  showCategory?: boolean;
}

function ProductCard({ product, showCategory = false }: ProductCardProps) {
  const addToCart = useCartStore((state) => state.addToCart);

  return (
    <div className="group overflow-hidden rounded-lg bg-white shadow-md transition-all duration-300 hover:shadow-xl">
      <Link href={`/products/${product.id}`}>
        <div className="relative h-48 overflow-hidden">
          <Image
            src={product.image}
            alt={product.name}
            width={500}
            height={500}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />

          {/* Quick actions overlay */}
          <div className="absolute top-4 right-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <button className="rounded-full bg-white p-2 shadow-md transition-colors hover:bg-gray-50">
              <Heart className="h-4 w-4 text-gray-600" />
            </button>
          </div>
        </div>
      </Link>

      <div className="p-4">
        <Link href={`/products/${product.id}`}>
          <h3 className="mb-2 line-clamp-2 text-lg font-semibold text-gray-900 transition-colors group-hover:text-blue-600">
            {product.name}
          </h3>
        </Link>

        <p className="mb-3 line-clamp-2 text-sm text-gray-600">
          {product.description}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xl font-bold text-green-600">
            ${product.price.toFixed(2)}
          </span>

          <Button
            size="sm"
            className="flex items-center gap-2"
            onClick={(e) => {
              e.preventDefault();
              addToCart(product);
            }}
          >
            <ShoppingCart className="h-4 w-4" />
            Add to Cart
          </Button>
        </div>
      </div>
    </div>
  );
}

// Cart Component
function Cart() {
  const {
    items,
    incrementQuantity,
    decrementQuantity,
    removeFromCart,
    getCartTotalPrice,
    clearCart,
  } = useCartStore();

  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const totalItems = useCartStore((state) => state.getCartTotalItems());
  const totalPrice = getCartTotalPrice();

  const handleCheckout = () => {
    setIsOpen(false);
    router.push("/checkout");
  };

  return (
    <div className="fixed right-4 bottom-4 z-50">
      {/* Cart Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-full bg-blue-600 p-4 text-white shadow-lg transition-colors hover:bg-blue-700"
      >
        <ShoppingCart className="h-6 w-6" />
        {totalItems > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
            {totalItems}
          </span>
        )}
      </button>

      {/* Cart Panel */}
      {isOpen && (
        <div className="absolute right-0 bottom-16 flex max-h-96 w-80 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-200 p-4">
            <h3 className="text-lg font-semibold">
              Your Cart ({totalItems} items)
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {items.length === 0 ? (
              <p className="py-8 text-center text-gray-500">
                Your cart is empty
              </p>
            ) : (
              <div className="space-y-4">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between border-b pb-3"
                  >
                    <div className="flex items-center space-x-3">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-12 w-12 rounded object-cover"
                      />
                      <div>
                        <h4 className="line-clamp-1 text-sm font-medium">
                          {item.name}
                        </h4>
                        <p className="font-semibold text-green-600">
                          ${item.price.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => decrementQuantity(item.id)}
                        className="rounded-full bg-gray-100 p-1 hover:bg-gray-200"
                      >
                        <Minus className="h-3 w-3" />
                      </button>

                      <span className="text-sm font-medium">
                        {item.quantity}
                      </span>

                      <button
                        onClick={() => incrementQuantity(item.id)}
                        className="rounded-full bg-gray-100 p-1 hover:bg-gray-200"
                      >
                        <Plus className="h-3 w-3" />
                      </button>

                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="ml-2 p-1 text-red-500 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="border-t border-gray-200 p-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-semibold">Total:</span>
                <span className="text-xl font-bold text-green-600">
                  ${totalPrice.toFixed(2)}
                </span>
              </div>

              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={clearCart}
                >
                  Clear Cart
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={handleCheckout}
                >
                  Pay Now
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Main PesaPalCart Component
export default function PesaPalCart() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="mb-8 text-center text-3xl font-bold">Featured Products</h2>

      <div className="container mx-auto mb-12 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sampleProducts.map((product) => (
          <ProductCard key={product.id} product={product} showCategory={true} />
        ))}
      </div>

      <Cart />
    </div>
  );
}
