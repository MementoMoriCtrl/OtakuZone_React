import AppRouter from './routes/AppRouter.jsx'

import FavoritesProvider from './state/FavoritesProvider.jsx'
import AuthProvider from './state/AuthProvider.jsx'
import SubscriptionProvider from './state/SubscriptionProvider.jsx'

export default function App() {
  return <AuthProvider><SubscriptionProvider><FavoritesProvider><AppRouter /></FavoritesProvider></SubscriptionProvider></AuthProvider>
}
