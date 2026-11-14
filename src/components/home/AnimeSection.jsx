import SectionHeading from '../common/SectionHeading.jsx'
import ResourceState from '../common/ResourceState.jsx'
import AnimeCollection from './AnimeCollection.jsx'
import useResource from '../../hooks/useResource.js'

export default function AnimeSection({ id, title, eyebrow, description, loader, isNew = false }) {
  const resource = useResource(loader)
  const anime = resource.data?.items ?? []

  return (
    <section aria-labelledby={id}>
      <SectionHeading id={id} eyebrow={eyebrow} title={title} description={description} to="/animes" linkLabel={isNew ? 'Explorar novedades' : 'Ver todos'} />
      <ResourceState resource={resource} empty={!anime.length} />
      {!resource.loading && !resource.error && <AnimeCollection anime={anime} isNew={isNew} />}
    </section>
  )
}
