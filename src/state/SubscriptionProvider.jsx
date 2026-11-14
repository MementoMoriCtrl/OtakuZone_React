import { useCallback } from 'react'
import useAuth from '../hooks/useAuth.js'
import useResource from '../hooks/useResource.js'
import { getSubscription } from '../services/commerce.js'
import { SubscriptionContext } from './SubscriptionContext.js'

export default function SubscriptionProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id
  const loader = useCallback((options) => userId ? getSubscription(options) : Promise.resolve(null), [userId])
  const resource = useResource(loader)
  return <SubscriptionContext.Provider value={{ ...resource, premium: resource.data?.code === 'premium' }}>{children}</SubscriptionContext.Provider>
}
