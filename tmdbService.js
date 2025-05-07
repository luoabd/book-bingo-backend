import fetch from "node-fetch";
import * as dotenv from "dotenv";

dotenv.config();

async function searchMedia(query, cache) {
  const inputValue = query;
  const cacheKey = `tmdb_search_${inputValue.toLowerCase().trim()}`;

  const cachedResult = cache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  const bearerToken = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!bearerToken) {
    return { error: 'TMDB API access token not configured' };
  }

  const url = `https://api.themoviedb.org/3/search/multi?query=${inputValue}%20of%20thrones&include_adult=false&language=en-US&page=1`;
  const options = {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer  ${bearerToken}`,
    }
  };

  try {
    const response = await fetch(url, options);
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      return {};
    }
    
    // Filter to only include movies and TV shows (exclude people and other types)
    const filteredResults = data.results.filter(item => 
      item.media_type === 'movie' || item.media_type === 'tv'
    );
    
    const resList = {};
    filteredResults.slice(0, 10).forEach((item, i) => {
      resList[i] = {
        id: i,
        title: item.media_type === 'movie' ? item.title : item.name,
        imgLink: item.poster_path 
          ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
          : null,
      };
    });

    cache.set(cacheKey, resList);
    return resList;
    } catch (error) {
    console.error('TMDB API error:', error);
    return { error: 'Failed to fetch from TMDB' };
  }
}

export { searchMedia };
