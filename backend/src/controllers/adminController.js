import { success } from '../utils/responses.js'
export function createAdminController(service) {
  const write = method => async (req,res) => success(res,await service[method](req.validated.params.id,req.validated.body,req.auth.user.id))
  return {
    dashboard: async (_req,res) => success(res,await service.dashboard()),
    list: kind => async (req,res) => success(res,await service.list(kind,req.validated.query.page)),
    createProduct: async (req,res) => res.status(201).json({success:true,data:await service.createProduct(req.validated.body,req.auth.user.id)}),
    createCategory: async (req,res) => res.status(201).json({success:true,data:await service.createCategory(req.validated.body)}),
    updateProduct: write('updateProduct'), updateCategory: write('updateCategory'), inventory: write('inventory'), orderState: write('orderState'),
    deactivateProduct: async (req,res) => success(res,await service.deactivateProduct(req.validated.params.id)),
    order: async (req,res) => success(res,await service.order(req.validated.params.id)),
  }
}
