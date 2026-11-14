import { success } from '../utils/responses.js'
export function createCommerceController(service) {
  const read = (method) => async (request, response) => success(response, await service[method](request.auth?.user.id, request.validated?.params?.id))
  const write = (method) => async (request, response) => success(response, await service[method](request.auth.user.id, request.validated.body))
  return {
    cart: read('cart'), orders: read('orders'), order: read('order'), subscription: read('subscription'),
    plans: async (_request, response) => success(response, await service.plans()),
    add: write('add'), changePlan: write('changePlan'),
    update: async (request, response) => success(response, await service.update(request.auth.user.id, request.validated.params.id, request.validated.body)),
    remove: async (request, response) => success(response, await service.remove(request.auth.user.id, request.validated.params.id)),
    checkout: async (request, response) => {
      const order = await service.checkout(request.auth.user.id, request.validated.body)
      return response.status(order.replayed ? 200 : 201).json({ success: true, data: order })
    },
  }
}
