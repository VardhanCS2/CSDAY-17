import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CreditCard, LockKeyhole, Truck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { api, errorMessage, responseData } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cartQueryKey, useCart } from '@/hooks/use-cart'
import { useAuth } from '@/hooks/useAuth'
import { useProduct } from '@/hooks/use-products'
import { checkoutSchema, type CheckoutValues } from '@/lib/validation'
import { formatCardExpiry, formatCardNumber, isValidCardExpiry, isValidCardNumber } from '@/lib/payment-format'
import { formatPrice } from '@/lib/utils'
import type { CartItem, Order } from '@/types/models'

const fields: Array<{ name: keyof CheckoutValues; label: string; autoComplete: string }> = [
  { name: 'full_name', label: 'Full name', autoComplete: 'name' },
  { name: 'email', label: 'Email', autoComplete: 'email' },
  { name: 'phone', label: 'Phone', autoComplete: 'tel' },
  { name: 'address_line', label: 'Street address', autoComplete: 'street-address' },
  { name: 'city', label: 'City', autoComplete: 'address-level2' },
  { name: 'postal_code', label: 'Postal code', autoComplete: 'postal-code' },
  { name: 'country', label: 'Country', autoComplete: 'country-name' },
]

type PaymentMethod = 'card' | 'upi' | 'cash_on_delivery'

export function CheckoutPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const cartQuery = useCart()
  const directProductId = searchParams.get('product_id') || undefined
  const directQuantity = Number(searchParams.get('quantity') || '1')
  const directPurchase = directProductId !== undefined
  const productQuery = useProduct(directProductId)
  const directProduct = productQuery.data
  const directItems: CartItem[] = directProduct ? [{
    product_id: directProduct.id,
    name: directProduct.name,
    description: directProduct.description,
    image_url: directProduct.image_url,
    price: directProduct.price,
    quantity: directQuantity,
    total_price: directProduct.price * directQuantity,
  }] : []
  const items = directPurchase ? directItems : (cartQuery.data ?? [])
  const subtotal = items.reduce((sum, item) => sum + Number(item.total_price || item.price * item.quantity), 0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash_on_delivery')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [upiId, setUpiId] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const form = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      full_name: user?.name ?? '',
      email: user?.email ?? '',
      phone: '',
      address_line: '',
      city: '',
      postal_code: '',
      country: '',
    },
  })
  const { errors: formErrors } = form.formState
  const orderMutation = useMutation({
    mutationFn: async ({ address, method }: { address: CheckoutValues; method: PaymentMethod }) =>
      responseData<Order>(await api.post('/orders/', {
        shipping_address: address,
        payment_method: method,
        ...(directPurchase ? { items: [{ product_id: directProduct!.id, quantity: directQuantity }] } : {}),
      })),
    onSuccess: async (order) => {
      await Promise.all([
        ...(directPurchase ? [] : [queryClient.invalidateQueries({ queryKey: cartQueryKey(user?.id) })]),
        queryClient.invalidateQueries({ queryKey: ['orders', user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ])
      toast.success('Demo order placed. No payment was processed.', { id: `order-${order.id}` })
      navigate('/orders')
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  })

  async function submitOrder(address: CheckoutValues) {
    setPaymentError('')
    if (paymentMethod === 'card') {
      if (!isValidCardNumber(cardNumber)) {
        setPaymentError('Enter a valid card number.')
        return
      }
      if (!isValidCardExpiry(cardExpiry)) {
        setPaymentError('Enter a valid, unexpired card expiry date.')
        return
      }
      if (!/^\d{3,4}$/.test(cardCvv)) {
        setPaymentError('Enter a 3–4 digit security code.')
        return
      }
    }
    if (paymentMethod === 'upi' && !/^[\w.-]+@[\w.-]+$/.test(upiId.trim())) {
      setPaymentError('Enter a valid UPI ID, for example name@bank.')
      return
    }
    orderMutation.mutate({ address, method: paymentMethod })
  }

  if (cartQuery.isPending || (directPurchase && productQuery.isPending)) return <main className="route-loading">Loading your order...</main>
  if (!directPurchase && cartQuery.isError) return <main className="account-page"><div className="notice notice-error" role="alert">{errorMessage(cartQuery.error)}</div></main>
  if (directPurchase && (!directProduct || !Number.isInteger(directQuantity) || directQuantity < 1 || directQuantity > 100 || directQuantity > directProduct.stock)) {
    return <main className="account-page"><div className="notice notice-error" role="alert">{directProduct ? 'The requested quantity is unavailable.' : errorMessage(productQuery.error) || 'This product could not be found.'}</div><Link className="text-link" to="/">Return to the collection</Link></main>
  }
  if (!items.length) return <main className="account-page"><div className="empty-state cart-empty"><h1>Your bag is empty.</h1><p>Add something to your bag before checking out.</p><Link className="text-link" to="/">Return to the collection</Link></div></main>

  return (
    <main className="account-page checkout-page">
      <Link className="back-link" to={directPurchase ? `/product/${directProduct?.id}` : '/cart'}><ArrowLeft size={15} /> {directPurchase ? 'Back to product' : 'Back to your bag'}</Link>
      <div className="account-page-heading"><div><p className="eyebrow"><span className="eyebrow-line" /> Almost yours</p><h1>Checkout</h1></div></div>
      <div className="cart-layout">
        <form className="admin-product-form checkout-form" onSubmit={form.handleSubmit(submitOrder)} noValidate>
          <div className="admin-form-title"><div><h2>Delivery details</h2><p className="summary-note">Where should we send your order?</p></div></div>
          <div className="admin-form-grid checkout-fields">
            {fields.map(({ name, label, autoComplete }) => {
              const error = formErrors[name]
              return (
                <label className="form-field" key={name}>
                  <span>{label}</span>
                  <Input autoComplete={autoComplete} aria-invalid={Boolean(error)} {...form.register(name)} />
                  {error?.message && <small className="field-error">{error.message}</small>}
                </label>
              )
            })}
          </div>
          <div className="payment-choice">
            <div className="admin-form-title"><div><h2>Payment method</h2><p className="summary-note">Demo checkout only — no real payment will be taken.</p></div></div>
            <div className="payment-methods" role="radiogroup" aria-label="Payment method">
              <button type="button" role="radio" aria-checked={paymentMethod === 'card'} className={paymentMethod === 'card' ? 'selected' : ''} onClick={() => setPaymentMethod('card')}><CreditCard size={17} /> Card</button>
              <button type="button" role="radio" aria-checked={paymentMethod === 'upi'} className={paymentMethod === 'upi' ? 'selected' : ''} onClick={() => setPaymentMethod('upi')}>UPI</button>
              <button type="button" role="radio" aria-checked={paymentMethod === 'cash_on_delivery'} className={paymentMethod === 'cash_on_delivery' ? 'selected' : ''} onClick={() => setPaymentMethod('cash_on_delivery')}><Truck size={17} /> Pay on delivery</button>
            </div>
            {paymentMethod === 'card' && <div className="admin-form-grid checkout-fields">
              <label className="form-field"><span>Card number</span><Input inputMode="numeric" autoComplete="cc-number" aria-label="Card number" placeholder="1234 5678 9012 3456" value={cardNumber} onChange={(event) => setCardNumber(formatCardNumber(event.target.value))} /></label>
              <label className="form-field"><span>Expiry (MM/YY)</span><Input inputMode="numeric" autoComplete="cc-exp" aria-label="Expiry (MM/YY)" placeholder="MM/YY" value={cardExpiry} onChange={(event) => setCardExpiry(formatCardExpiry(event.target.value))} /></label>
              <label className="form-field"><span>Security code</span><Input inputMode="numeric" autoComplete="cc-csc" aria-label="Security code" placeholder="123" value={cardCvv} onChange={(event) => setCardCvv(event.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
            </div>}
            {paymentMethod === 'upi' && <label className="form-field"><span>UPI ID</span><Input autoComplete="off" placeholder="name@bank" value={upiId} onChange={(event) => setUpiId(event.target.value)} /></label>}
            <p className="summary-note"><LockKeyhole size={14} /> Card and UPI details are validated here only; they are never sent to the server or stored.</p>
          </div>
          <p className="summary-note"><LockKeyhole size={14} /> Your address is stored with this order so you can review it later.</p>
          {paymentError && <p className="form-message error-text" role="alert">{paymentError}</p>}
          {orderMutation.isError && <p className="form-message error-text" role="alert">{errorMessage(orderMutation.error)}</p>}
          <Button type="submit" disabled={orderMutation.isPending}>{orderMutation.isPending ? 'Placing order...' : 'Place order'}<ArrowRight size={15} /></Button>
        </form>
        <aside className="order-summary">
          <p className="eyebrow">Order summary</p>
          {items.map((item) => <div className="summary-row" key={item.product_id}><span>{item.name} × {item.quantity}</span><b>{formatPrice(item.total_price || item.price * item.quantity)}</b></div>)}
          <div className="summary-total"><span>Total</span><b>{formatPrice(subtotal)}</b></div>
          <p className="summary-note">Demo payment selection: {paymentMethod === 'cash_on_delivery' ? 'Pay on delivery' : paymentMethod.toUpperCase()}.</p>
        </aside>
      </div>
    </main>
  )
}
