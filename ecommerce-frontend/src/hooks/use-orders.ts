import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, responseData } from '@/api/client'
import { useAuthStore } from '@/stores/auth-store'
import type { Order } from '@/types/models'

type OrderAction =
  | { orderId: number; action: 'cancel' }
  | { orderId: number; action: 'status'; status: Order['status'] }

export function useOrders({ admin = false }: { admin?: boolean } = {}) {
  const userId = useAuthStore((state) => state.user?.id)
  const queryKey = admin ? ['admin', 'orders'] : ['orders', userId]
  return useQuery({
    queryKey,
    queryFn: async () => responseData<Order[]>(await api.get(admin ? '/orders/admin/all' : '/orders/')),
    enabled: Boolean(userId),
  })
}

export function useOrderActions({ admin = false }: { admin?: boolean } = {}) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((state) => state.user?.id)
  const queryKey = admin ? ['admin', 'orders'] : ['orders', userId]
  return useMutation<unknown, Error, OrderAction, { previousOrders: Order[] }>({
    mutationFn: (variables: OrderAction) => variables.action === 'cancel'
      ? api.patch(`/orders/${variables.orderId}/cancel`)
      : api.patch(`/orders/${variables.orderId}/status`, { status: variables.status }),
    onMutate: async (variables) => {
      const { orderId, action } = variables
      await queryClient.cancelQueries({ queryKey })
      const previousOrders = queryClient.getQueryData<Order[]>(queryKey) || []
      const status = action === 'cancel' ? 'Cancelled' : variables.status
      queryClient.setQueryData(queryKey, previousOrders.map((order) =>
        order.id === orderId ? { ...order, status } : order,
      ))
      return { previousOrders }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousOrders) queryClient.setQueryData(queryKey, context.previousOrders)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}