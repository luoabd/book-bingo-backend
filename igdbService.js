import fetch from "node-fetch";
import * as dotenv from "dotenv";

dotenv.config();

let igdbAccessToken = null;
let tokenExpiry = null;

async function getIGDBAccessToken() {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  
  try {
    const response = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      {
        method: 'POST'
      }
    );
    
    const data = await response.json();
    igdbAccessToken = data.access_token;
    // Expiry time is around 55 days, will set 50 for safety
    tokenExpiry = Date.now() + (50 * 24 * 60 * 60 * 1000);
    
    return igdbAccessToken;
  } catch (error) {
    console.error("Error getting IGDB access token:", error.message);
    throw error;
  }
}

async function searchGames(query, cache) {
  const inputValue = query;
  const cacheKey = `game_search_${inputValue.toLowerCase().trim()}`;

  const cachedResult = cache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  if (!igdbAccessToken || Date.now() > tokenExpiry) {
    try {
      await getIGDBAccessToken();
    } catch (error) {
      return { error: 'Failed to authenticate with IGDB' };
    }
  }

  try {
    const gamesResponse = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Client-ID': process.env.IGDB_CLIENT_ID,
        'Authorization': `Bearer ${igdbAccessToken}`
      },
      body: `
        search "${inputValue}";
        fields name, cover;
        limit 10;
      `
    });

    const games = await gamesResponse.json();
    
    const gameIds = games.map(game => game.id);
    let coverData = [];
    
    if (gameIds.length > 0) {
      const coverResponse = await fetch('https://api.igdb.com/v4/covers', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Client-ID': process.env.IGDB_CLIENT_ID,
          'Authorization': `Bearer ${igdbAccessToken}`
        },
        body: `
          fields game, url;
          where game = (${gameIds.join(',')});
        `
      });
      
      coverData = await coverResponse.json();
    }

    // Transform the data to match the format expected by the frontend
    const resList = {};
    games.forEach((game, i) => {
      const cover = coverData.find(c => c.game === game.id);

      resList[i] = {
        id: i,
        title: game.name,
        imgLink: cover ? cover.url.replace('t_thumb', 't_cover_big').replace('//', 'https://') : null,
        gameId: game.id,
      };
    });

    cache.set(cacheKey, resList);
    return resList;
  } catch (error) {
    console.error('IGDB API error:', error);
    return { error: 'Failed to fetch games' };
  }
}

export { getIGDBAccessToken, searchGames };
