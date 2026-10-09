import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Order } from '@/types/models'

export function cn(...inputs: Array<string | false | null | undefined>) {
  return twMerge(clsx(inputs))
}

export function formatPrice(value: number | string) {
  const locale = import.meta.env.VITE_LOCALE || 'en-IN'
  const currency = import.meta.env.VITE_CURRENCY || 'INR'
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(value) || 0)
}

export function formatPaymentMethod(method: Order['payment_method']): string {
  switch (method) {
    case 'card': return 'Card'
    case 'upi': return 'UPI'
    case 'cash_on_delivery': return 'Cash on delivery'
    default: return 'Not specified'
  }
}