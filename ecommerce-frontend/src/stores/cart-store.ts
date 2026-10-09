import { create } from 'zustand'
import type { CartItem, Product } from '@/types/models'

interface CartState {
  items: CartItem[]
  setItems: (items: CartItem[]) => void
  addItem: (product: Product, quantity?: number) => void
  setQuantity: (productId: number, quantity: number) => void
  removeItem: (productId: number) => void
  clear: () => void
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  setItems: (items) => set({ items }),
  addItem: (product, quantity = 1) => set((state) => {
    const existing = state.items.find((item) => item.product_id === product.id)
    const items = existing
      ? state.items.map((item) => item.product_id === product.id
        ? { ...item, quantity: item.quantity + quantity, total_price: product.price * (item.quantity + quantity) }
        : item)
      : [...state.items, {
        product_id: product.id,
        name: product.name,
        description: product.description,
        image_url: product.image_url,
        price: product.price,
        quantity,
        total_price: product.price * quantity,
      }]
    return { items }
  }),
  setQuantity: (productId, quantity) => set((state) => ({
    items: quantity < 1
      ? state.items.filter((item) => item.product_id !== productId)
      : state.items.map((item) => item.product_id === productId
        ? { ...item, quantity, total_price: item.price * quantity }
        : item),
  })),
  removeItem: (productId) => set((state) => ({
    items: state.items.filter((item) => item.product_id !== productId),
  })),
  clear: () => set({ items: [] }),
}))