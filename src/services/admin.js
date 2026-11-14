import { accountRequest } from './auth.js'
export const adminDashboard = options => accountRequest('/admin/dashboard',{...options,privateRequest:true})
export const adminList = (kind,page=1,options) => accountRequest(`/admin/${kind}?page=${page}`,{...options,privateRequest:true})
export const adminWrite = (path,method,data) => accountRequest(`/admin/${path}`,{method,data,privateRequest:true})
export const adminOrder = id => accountRequest(`/admin/orders/${id}`,{privateRequest:true})
