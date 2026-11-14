import AppRouter from './routes/AppRouter.jsx'

import FavoritesProvider from './state/FavoritesProvider.jsx'

export default function App() {
  return <FavoritesProvider><AppRouter /></FavoritesProvider>
}
