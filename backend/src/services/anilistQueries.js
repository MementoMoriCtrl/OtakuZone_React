const fields=`id title { romaji english native } coverImage { large } bannerImage description(asHtml:false)
  genres status format averageScore popularity episodes startDate { year month day } season seasonYear`
export const anilistQueries=Object.freeze({
  list:`query AnimeCatalog($page:Int!,$perPage:Int!,$search:String,$genre:String,$status:MediaStatus,$sort:[MediaSort],$season:MediaSeason,$year:Int) {
    Page(page:$page,perPage:$perPage) { pageInfo { hasNextPage } media(type:ANIME,isAdult:false,search:$search,genre:$genre,status:$status,sort:$sort,season:$season,seasonYear:$year) { ${fields} } }
  }`,
  genres:'query AnimeGenres { GenreCollection }',
  detail:`query AnimeDetails($id:Int!) { Media(id:$id,type:ANIME,isAdult:false) { ${fields}
    characters(role:MAIN,perPage:6) { nodes { id name { full } image { medium } } }
    relations { edges { relationType node { id type title { romaji english native } coverImage { large } season seasonYear } } }
  } }`,
})
