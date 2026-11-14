import { useContext } from 'react'
import FavoritesContext from '../state/FavoritesContext.js'

export default function useFavorites() {
  const value = useContext(FavoritesContext)
  if (!value) throw new Error('useFavorites requiere FavoritesProvider')
  return value
}
