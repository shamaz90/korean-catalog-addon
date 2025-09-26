const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const TMDB_API_KEY = 'a6635913d6574e1d0acf79cacf6db07d';

const builder = new addonBuilder({
    id: 'com.korean.catalog',
    version: '1.2.0',
    name: 'Korean Catalog',
    description: 'ALL Korean Movies and TV Shows with Genres',
    catalogs: [
        {
            type: 'movie',
            id: 'korean-movies',
            name: 'Korean Movies',
            extra: [
                { name: 'search' },
                { name: 'genre' },
                { name: 'skip' }
            ]
        },
        {
            type: 'series',
            id: 'korean-series', 
            name: 'Korean Series',
            extra: [
                { name: 'search' },
                { name: 'genre' },
                { name: 'skip' }
            ]
        }
    ],
    resources: ['catalog'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'tmdb']
});

// Function to fetch ALL Korean content with pagination
async function fetchAllKoreanContent(type, genreId = null, search = null) {
    let allResults = [];
    let page = 1;
    let hasMore = true;

    try {
        while (hasMore && page <= 20) { // Limit to 20 pages (400 items) for safety
            let url;
            
            if (search) {
                url = `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(search)}&language=en-US&page=${page}&include_adult=false&region=KR`;
            } else if (genreId) {
                url = `https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_API_KEY}&language=en-US&sort_by=popularity.desc&page=${page}&with_original_language=ko&with_genres=${genreId}&region=KR`;
            } else {
                url = `https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_API_KEY}&language=en-US&sort_by=popularity.desc&page=${page}&with_original_language=ko&region=KR`;
            }

            const response = await fetch(url);
            const data = await response.json();
            
            if (!data.results || data.results.length === 0) {
                hasMore = false;
                break;
            }
            
            // Filter only Korean content and map to Stremio format
            const koreanResults = data.results
                .filter(item => item.original_language === 'ko')
                .map(item => ({
                    id: `tmdb:${item.id}`,
                    type: type,
                    name: item.title || item.name,
                    poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                    background: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
                    description: item.overview,
                    releaseInfo: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear().toString() : null,
                    imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null,
                    genres: item.genre_ids || []
                }));
            
            allResults = allResults.concat(koreanResults);
            
            // Stop if we've reached the last page
            if (page >= data.total_pages) {
                hasMore = false;
            } else {
                page++;
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } catch (error) {
        console.error(`Error fetching ${type}:`, error);
    }
    
    return allResults;
}

// Cache for better performance
let contentCache = {
    movies: { data: [], timestamp: 0 },
    series: { data: [], timestamp: 0 }
};
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache

builder.defineCatalogHandler(async (args) => {
    console.log('Catalog request:', args);
    
    const skip = args.extra && args.extra.skip ? parseInt(args.extra.skip) : 0;
    const cacheKey = args.type === 'movie' ? 'movies' : 'series';
    const now = Date.now();
    
    let allContent = [];
    
    // Use cache if available and fresh
    if (contentCache[cacheKey].data.length > 0 && 
        now - contentCache[cacheKey].timestamp < CACHE_DURATION &&
        !args.extra?.search && !args.extra?.genre) {
        
        console.log('Using cached content');
        allContent = contentCache[cacheKey].data;
    } else {
        console.log('Fetching fresh content from TMDB');
        allContent = await fetchAllKoreanContent(args.type, args.extra?.genre, args.extra?.search);
        
        // Update cache (only for non-search, non-genre requests)
        if (!args.extra?.search && !args.extra?.genre) {
            contentCache[cacheKey].data = allContent;
            contentCache[cacheKey].timestamp = now;
        }
    }
    
    // Apply pagination
    const pageSize = 100; // Show 100 items per page in Stremio
    const startIndex = skip;
    const endIndex = startIndex + pageSize;
    const paginatedContent = allContent.slice(startIndex, endIndex);
    
    console.log(`Returning ${paginatedContent.length} items (${startIndex}-${endIndex} of ${allContent.length} total)`);
    
    return { 
        metas: paginatedContent,
        hasMore: endIndex < allContent.length
    };
});

const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port }).then(() => {
    console.log(`Korean Catalog Addon running on port ${port}`);
    console.log('This addon will show ALL Korean content from TMDB');
});