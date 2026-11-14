export function createAdminService(repository) {
  return {
    dashboard: () => repository.dashboard(),
    list: (kind,page) => repository.list(kind,page),
    createProduct: (body,actor) => repository.createProduct(body,actor),
    updateProduct: (id,body) => repository.updateProduct(id,body),
    deactivateProduct: id => repository.deactivateProduct(id),
    createCategory: body => repository.createCategory(body),
    updateCategory: (id,body) => repository.updateCategory(id,body),
    inventory: (id,body,actor) => repository.updateInventory(id,body,actor),
    order: id => repository.order(id),
    orderState: (id,body,actor) => repository.updateOrder(id,body,actor),
  }
}
