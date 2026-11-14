import AppRouter from './routes/AppRouter.jsx'

import FavoritesProvider from './state/FavoritesProvider.jsx'
import AuthProvider from './state/AuthProvider.jsx'

export default function App() {
  return <AuthProvider><FavoritesProvider><AppRouter /></FavoritesProvider></AuthProvider>
}
