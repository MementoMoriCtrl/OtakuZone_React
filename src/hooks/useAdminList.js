import { useCallback,useState } from 'react'
import useResource from './useResource.js'
import { adminList } from '../services/admin.js'
export default function useAdminList(kind) {
  const [page,setPage]=useState(1)
  const loader=useCallback(options=>adminList(kind,page,options),[kind,page])
  const resource=useResource(loader)
  return {...resource,page,setPage}
}
