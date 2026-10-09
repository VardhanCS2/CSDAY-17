import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { errorMessage } from '@/api/client'
import { ProductImage } from '@/components/ProductImage'
import { useCart, useCartActions } from '@/hooks/use-cart'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/utils'
import type { CartItem } from '@/types/models'

const EMPTY_CART: CartItem[] = []

export function CartPage() {
  const navigate = useNavigate()
  const cartQuery = useCart()
  const items = cartQuery.data || EMPTY_CART
  const { update, remove } = useCartActions()
  const [error, setError] = useState('')
  const busy = update.isPending || remove.isPending

  async function changeQuantity(productId: number, quantity: number) {
    setError('')
    try {
      await update.mutateAsync({ productId, quantity })
    } catch (requestError) { setError(errorMessage(requestError)) }
  }

  async function removeItem(productId: number) {
    setError('')
    try {
      await remove.mutateAsync(productId)
    } catch (requestError) { setError(errorMessage(requestError)) }
  }

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + Number(item.total_price || item.price * item.quantity), 0), [items])
  if (cartQuery.isPending) return <main className="route-loading">Loading your bag...</main>

  return (
    <main className="account-page">
      <Link className="back-link" to="/"><ArrowLeft size={15} /> Continue browsing</Link>
      <div className="account-page-heading"><div><p className="eyebrow"><span className="eyebrow-line" /> Your selection</p><h1>Your bag<span className="heading-count">{items.length}</span></h1></div><span className="result-total">{items.reduce((sum, item) => sum + item.quantity, 0)} items</span></div>
      {(error || (cartQuery.error && errorMessage(cartQuery.error))) && <div className="notice notice-error" role="alert">{error || errorMessage(cartQuery.error)}</div>}
      {!items.length ? <div className="empty-state cart-empty"><span className="empty-icon"><ShoppingBag size={22} /></span><h2>Your bag is taking a breather.</h2><p>Find a few everyday favorites and they’ll be waiting here.</p><Link className="ui-button ui-button-primary ui-button-default" to="/">Explore the collection <ArrowRight size={15} /></Link></div> : (
        <div className="cart-layout">
          <div className="cart-items">
            {items.map((item) => <article className="cart-item" key={item.product_id}>
              <Link to={`/product/${item.product_id}`} className="cart-item-image"><ProductImage product={{ id: item.product_id, name: item.name, image_url: item.image_url ?? null }} className="product-image" /></Link>
              <div className="cart-item-description"><Link to={`/product/${item.product_id}`} className="product-name">{item.name}</Link><p>{item.description || 'A considered everyday essential.'}</p><button className="remove-link" disabled={busy} onClick={() => removeItem(item.product_id)}><Trash2 size={13} /> Remove</button></div>
              <div className="cart-item-controls"><strong>{formatPrice(item.total_price || item.price * item.quantity)}</strong><div className="quantity-stepper"><button disabled={busy || item.quantity <= 1} onClick={() => changeQuantity(item.product_id, item.quantity - 1)} aria-label={`Decrease ${item.name} quantity`}><Minus size={13} /></button><span>{item.quantity}</span><button disabled={busy} onClick={() => changeQuantity(item.product_id, item.quantity + 1)} aria-label={`Increase ${item.name} quantity`}><Plus size={13} /></button></div></div>
            </article>)}
          </div>
          <aside className="order-summary"><p className="eyebrow">At a glance</p><div className="summary-row"><span>Subtotal</span><b>{formatPrice(subtotal)}</b></div><div className="summary-row"><span>Shipping</span><span>Confirmed at checkout</span></div><div className="summary-total"><span>Total</span><b>{formatPrice(subtotal)}</b></div><Button className="checkout-button" disabled={busy || !items.length} onClick={() => navigate('/payments')}>Continue to checkout<ArrowRight size={16} /></Button><p className="summary-note">Shipping details are confirmed before your order is placed.</p></aside>
        </div>
      )}
    </main>
  )
}