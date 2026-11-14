import { useContext } from 'react'
import { SubscriptionContext } from '../state/SubscriptionContext.js'
export default function useSubscription() { return useContext(SubscriptionContext) }
