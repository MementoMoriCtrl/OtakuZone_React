import { useState } from 'react'
import AnimeCard from './AnimeCard.jsx'
import AnimeDetailsDialog from './AnimeDetailsDialog.jsx'

export default function AnimeCollection({ anime, isNew = false }) {
  const [selectedAnime, setSelectedAnime] = useState(null)
  return <>
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {anime.map((item) => <AnimeCard key={item.id} anime={item} isNew={isNew} onDetails={setSelectedAnime} />)}
    </div>
    {selectedAnime && <AnimeDetailsDialog anime={selectedAnime} onClose={() => setSelectedAnime(null)} />}
  </>
}
