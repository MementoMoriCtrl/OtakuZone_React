export function createCommerceService(repository) {
  return {
    cart: (userId) => repository.getCart(userId),
    add: (userId, body) => repository.changeItem(userId, body.productId, body.quantity, 'add'),
    update: (userId, id, body) => repository.changeItem(userId, id, body.quantity, 'set'),
    remove: (userId, id) => repository.changeItem(userId, id, 0, 'remove'),
    checkout: (userId, body) => repository.checkout(userId, body.cartId, body.idempotencyKey),
    orders: (userId) => repository.listOrders(userId),
    order: (userId, id) => repository.getOrder(userId, id),
    plans: () => repository.plans(),
    subscription: (userId) => repository.subscription(userId),
    changePlan: (userId, body) => repository.subscription(userId, body.code),
  }
}
