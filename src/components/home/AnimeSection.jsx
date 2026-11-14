import { useState } from 'react'
import SectionHeading from '../common/SectionHeading.jsx'
import AnimeCard from './AnimeCard.jsx'
import AnimeDetailsDialog from './AnimeDetailsDialog.jsx'

export default function AnimeSection({ id, title, eyebrow, description, anime, isNew = false }) {
  const [selectedAnime, setSelectedAnime] = useState(null)

  return (
    <section aria-labelledby={id}>
      <SectionHeading id={id} eyebrow={eyebrow} title={title} description={description} to="/animes" linkLabel={isNew ? 'Explorar novedades' : 'Ver todos'} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {anime.map((item) => <AnimeCard key={item.id} anime={item} isNew={isNew} onDetails={setSelectedAnime} />)}
      </div>
      {selectedAnime && <AnimeDetailsDialog anime={selectedAnime} onClose={() => setSelectedAnime(null)} />}
    </section>
  )
}
