import { describe, expect, it } from 'vitest'
import { checkoutSchema, loginSchema, productSchema, registerSchema } from '@/lib/validation'
import { formatCardExpiry, formatCardNumber, isValidCardExpiry, isValidCardNumber } from '@/lib/payment-format'

describe('login validation', () => {
  it('accepts valid credentials', () => {
    expect(loginSchema.safeParse({ email: 'shop@example.com', password: 'password' }).success).toBe(true)
  })

  it('trims surrounding whitespace from email', () => {
    expect(loginSchema.parse({ email: ' shop@example.com ', password: 'password' }).email).toBe('shop@example.com')
  })

  it('rejects malformed email addresses', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'password' }).success).toBe(false)
  })

  it('requires a non-empty password', () => {
    expect(loginSchema.safeParse({ email: 'shop@example.com', password: '' }).success).toBe(false)
  })
})

describe('registration validation', () => {
  it('accepts a complete registration', () => {
    expect(registerSchema.safeParse({ name: 'Sam Lee', email: 'sam@example.com', password: 'safe-pass9!' }).success).toBe(true)
  })

  it('rejects a too-short name', () => {
    expect(registerSchema.safeParse({ name: 'S', email: 'sam@example.com', password: 'safe-pass9!' }).success).toBe(false)
  })

  it('requires a digit and a special character in the password', () => {
    expect(registerSchema.safeParse({ name: 'Sam Lee', email: 'sam@example.com', password: 'safe-pass!' }).success).toBe(false)
    expect(registerSchema.safeParse({ name: 'Sam Lee', email: 'sam@example.com', password: 'safepass9' }).success).toBe(false)
  })
})

describe('product form validation', () => {
  it('converts a valid price to a number', () => {
    expect(productSchema.parse({ name: 'Cup', description: '', price: '12.50', stock: '4' })).toMatchObject({ price: 12.5, image_url: '' })
  })

  it('accepts valid image URLs and rejects unsafe or malformed ones', () => {
    const base = { name: 'Cup', description: '', price: '12.50', stock: '4' }
    expect(productSchema.safeParse({ ...base, image_url: 'https://images.example.test/cup.jpg' }).success).toBe(true)
    expect(productSchema.safeParse({ ...base, image_url: 'javascript:alert(1)' }).success).toBe(false)
    expect(productSchema.safeParse({ ...base, image_url: 'not-a-url' }).success).toBe(false)
  })

  it('rejects prices with excess precision', () => {
    expect(productSchema.safeParse({ name: 'Cup', description: '', price: '12.501', stock: '4' }).success).toBe(false)
  })

  it('rejects negative prices and stock', () => {
    expect(productSchema.safeParse({ name: 'Cup', description: '', price: '-1', stock: '4' }).success).toBe(false)
    expect(productSchema.safeParse({ name: 'Cup', description: '', price: '1', stock: '-1' }).success).toBe(false)
  })

  it('rejects fractional stock', () => {
    expect(productSchema.safeParse({ name: 'Cup', description: '', price: '1', stock: '1.5' }).success).toBe(false)
  })
})

describe('checkout validation', () => {
  const address = {
    full_name: 'Sam Lee',
    email: 'sam@example.com',
    phone: '+1 555 010 0150',
    address_line: '10 Example Street',
    city: 'Example City',
    postal_code: '10001',
    country: 'Example Country',
  }

  it('accepts a complete delivery address', () => {
    expect(checkoutSchema.parse(address)).toEqual(address)
  })

  describe('demo card input formatting and validation', () => {
    it('formats card digits into groups without requiring spaces', () => {
      expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242')
      expect(formatCardNumber('4242 4242 4242 4242')).toBe('4242 4242 4242 4242')
      expect(formatCardNumber('42424242424242424242')).toBe('4242 4242 4242 4242 424')
    })

    it('inserts the expiry separator while typing', () => {
      expect(formatCardExpiry('1230')).toBe('12/30')
      expect(formatCardExpiry('12/30')).toBe('12/30')
      expect(formatCardExpiry('1')).toBe('1')
    })

    it('validates card numbers with the Luhn checksum', () => {
      expect(isValidCardNumber('4242 4242 4242 4242')).toBe(true)
      expect(isValidCardNumber('4242 4242 4242 4241')).toBe(false)
    })

    it('accepts current or future expiry months and rejects expired or invalid dates', () => {
      const now = new Date(2026, 5, 15)
      expect(isValidCardExpiry('06/26', now)).toBe(true)
      expect(isValidCardExpiry('07/26', now)).toBe(true)
      expect(isValidCardExpiry('05/26', now)).toBe(false)
      expect(isValidCardExpiry('13/30', now)).toBe(false)
    })
  })

  it('rejects missing delivery fields', () => {
    expect(checkoutSchema.safeParse({ ...address, address_line: '' }).success).toBe(false)
  })

  it('rejects an invalid checkout email', () => {
    expect(checkoutSchema.safeParse({ ...address, email: 'invalid' }).success).toBe(false)
  })

  it('rejects phone numbers without digits', () => {
    expect(checkoutSchema.safeParse({ ...address, phone: 'telephone' }).success).toBe(false)
  })
})
