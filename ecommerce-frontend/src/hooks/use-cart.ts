import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, responseData } from '@/api/client'
import { useAuthStore } from '@/stores/auth-store'
import { useCartStore } from '@/stores/cart-store'
import type { CartItem, Product } from '@/types/models'

export const cartQueryKey = (userId: number | undefined) => ['cart', userId] as const

async function fetchCart(): Promise<CartItem[]> {
  return responseData<CartItem[]>(await api.get('/cart/'))
}

export function useCart() {
  const userId = useAuthStore((state) => state.user?.id)
  const query = useQuery({
    queryKey: cartQueryKey(userId),
    queryFn: fetchCart,
    enabled: Boolean(userId),
  })

  useEffect(() => {
    if (query.data) useCartStore.getState().setItems(query.data)
  }, [query.data])

  return query
}

interface CartUpdate { productId: number; quantity: number }
interface CartAdd { product: Product; quantity: number }

function useOptimisticCartMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
  updateItems: (items: CartItem[], variables: TVariables) => CartItem[],
) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((state) => state.user?.id)
  const queryKey = cartQueryKey(userId)

  return useMutation<unknown, Error, TVariables, { previousItems: CartItem[] }>({
    mutationFn,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey })
      const previousItems = queryClient.getQueryData<CartItem[]>(queryKey) || []
      const nextItems = updateItems(previousItems, variables)
      queryClient.setQueryData(queryKey, nextItems)
      useCartStore.getState().setItems(nextItems)
      return { previousItems }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData(queryKey, context.previousItems)
        useCartStore.getState().setItems(context.previousItems)
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}

export function useCartActions() {
  const add = useOptimisticCartMutation(
    async ({ product, quantity }: CartAdd) => api.post('/cart/add', null, {
      params: { product_identifier: String(product.id), quantity },
    }),
    (items, { product, quantity }) => {
      const existing = items.find((item) => item.product_id === product.id)
      if (existing) return items.map((item) => item.product_id === product.id
        ? { ...item, quantity: item.quantity + quantity, total_price: product.price * (item.quantity + quantity) }
        : item)
      return [...items, {
        product_id: product.id,
        name: product.name,
        description: product.description,
        image_url: product.image_url,
        price: product.price,
        quantity,
        total_price: product.price * quantity,
      }]
    },
  )
  const update = useOptimisticCartMutation(
    ({ productId, quantity }: CartUpdate) => api.put('/cart/edit', null, { params: { product_id: productId, quantity } }),
    (items, { productId, quantity }) => quantity === 0
      ? items.filter((item) => item.product_id !== productId)
      : items.map((item) => item.product_id === productId
        ? { ...item, quantity, total_price: item.price * quantity }
        : item),
  )
  const remove = useOptimisticCartMutation(
    (productId: number) => api.delete(`/cart/remove/${productId}`),
    (items, productId) => items.filter((item) => item.product_id !== productId),
  )

  return { add, update, remove }
}