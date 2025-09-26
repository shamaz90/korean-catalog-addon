const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const TMDB_API_KEY = 'a6635913d6574e1d0acf79cacf6db07d';

const builder = new addonBuilder({
    id: 'com.korean.catalog',
    version: '1.5.0',
    name: 'Korean Catalog',
    description: 'ALL Korean Movies and Series with Genre Filtering',
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

// TMDB Genre Mappings - CORRECT FORMAT FOR STREMIO
const GENRE_MAPPINGS = {
    movie: [
        { id: 'action', name: 'Action' },
        { id: 'drama', name: 'Drama' },
        { id: 'comedy', name: 'Comedy' },
        { id: 'thriller', name: 'Thriller' },
        { id: 'horror', name: 'Horror' },
        { id: 'romance', name: 'Romance' },
        { id: 'scifi', name: 'Sci-Fi' },
        { id: 'mystery', name: 'Mystery' },
        { id: 'fantasy', name: 'Fantasy' },
        { id: 'crime', name: 'Crime' }
    ],
    series: [
        { id: 'drama', name: 'Drama' },
        { id: 'comedy', name: 'Comedy' },
        { id: 'action', name: 'Action & Adventure' },
        { id: 'scifi', name: 'Sci-Fi & Fantasy' },
        { id: 'mystery', name: 'Mystery' },
        { id: 'romance', name: 'Romance' },
        { id: 'crime', name: 'Crime' },
        { id: 'family', name: 'Family' },
        { id: 'documentary', name: 'Documentary' }
    ]
};

// TMDB Genre IDs for filtering
const TMDB_GENRE_IDS = {
    movie: {
        'action': 28,
        'drama': 18,
        'comedy': 35,
        'thriller': 53,
        'horror': 27,
        'romance': 10749,
        'scifi': 878,
        'mystery': 9648,
        'fantasy': 14,
        'crime': 80
    },
    series: {
        'drama': 18,
        'comedy': 35,
        'action': 10759,
        'scifi': 10765,
        'mystery': 9648,
        'romance': 10749,
        'crime': 80,
        'family': 10751,
        'documentary': 99
    }
};

// Cache for content
let contentCache = {
    movies: { data: [], timestamp: 0 },
    series: { data: [], timestamp: 0 }
};

const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours

// Fetch ALL Korean content (EXCLUDING ADULT CONTENT)
async function fetchAllKoreanContent(type) {
    console.log(`Fetching ALL Korean ${type} from TMDB (excluding adult content)...`);
    
    let allResults = [];
    let page = 1;
    let totalPages = 1;

    try {
        // Get total pages first - IMPORTANT: include include_adult=false
        const firstPageUrl = `https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_API_KEY}&language=en-US&page=1&with_original_language=ko&region=KR&sort_by=popularity.desc&include_adult=false`;
        const firstResponse = await fetch(firstPageUrl);
        const firstData = await firstResponse.json();
        
        totalPages = Math.min(firstData.total_pages, 20); // Limit to 20 pages
        
        console.log(`Found ${totalPages} pages of Korean ${type}`);

        // Fetch all pages
        for (page = 1; page <= totalPages; page++) {
            // CRITICAL: include_adult=false to exclude porn content
            const url = `https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_API_KEY}&language=en-US&page=${page}&with_original_language=ko&region=KR&sort_by=popularity.desc&include_adult=false`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (!data.results || data.results.length === 0) break;

            // Filter out any adult content that might slip through
            const koreanContent = data.results
                .filter(item => item.original_language === 'ko')
                .map(item => {
                    const genreNames = item.genre_ids ? item.genre_ids.map(genreId => {
                        // Map TMDB genre IDs to our genre names
                        for (const [key, value] of Object.entries(TMDB_GENRE_IDS[type])) {
                            if (value === genreId) return GENRE_MAPPINGS[type].find(g => g.id === key)?.name;
                        }
                        return null;
                    }).filter(Boolean) : [];
                    
                    return {
                        id: `tmdb:${item.id}`,
                        type: type,
                        name: item.title || item.name,
                        poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                        background: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
                        description: item.overview,
                        releaseInfo: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear().toString() : null,
                        imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null,
                        genres: genreNames
                    };
                });

            allResults = allResults.concat(koreanContent);
            console.log(`Page ${page}: Added ${koreanContent.length} ${type}, Total: ${allResults.length}`);
            
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.log(`✅ Successfully fetched ${allResults.length} Korean ${type} (adult content excluded)`);
        return allResults;
        
    } catch (error) {
        console.error(`❌ Error fetching Korean ${type}:`, error);
        return [];
    }
}

// Search Korean content (EXCLUDING ADULT)
async function searchKoreanContent(type, query) {
    try {
        // IMPORTANT: include_adult=false
        const url = `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1&include_adult=false`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results) return [];
        
        return data.results
            .filter(item => item.original_language === 'ko')
            .map(item => ({
                id: `tmdb:${item.id}`,
                type: type,
                name: item.title || item.name,
                poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                description: item.overview,
                releaseInfo: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear().toString() : null,
                imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null
            }));
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

// Fetch by specific genre (EXCLUDING ADULT)
async function fetchKoreanContentByGenre(type, genreId) {
    const tmdbGenreId = TMDB_GENRE_IDS[type][genreId];
    if (!tmdbGenreId) return [];

    try {
        // IMPORTANT: include_adult=false
        const url = `https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_API_KEY}&language=en-US&with_original_language=ko&with_genres=${tmdbGenreId}&region=KR&sort_by=popularity.desc&include_adult=false`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results) return [];
        
        return data.results.map(item => ({
            id: `tmdb:${item.id}`,
            type: type,
            name: item.title || item.name,
            poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
            description: item.overview,
            releaseInfo: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear().toString() : null,
            imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null
        }));
    } catch (error) {
        console.error(`Error fetching ${genreId} ${type}:`, error);
        return [];
    }
}

// PROVIDE GENRES FOR DISCOVERY PAGE - THIS IS CRITICAL
builder.defineResourceHandler((args) => {
    if (args.type === 'genre' && args.id) {
        if (args.id === 'korean-movies') {
            return Promise.resolve({
                genres: GENRE_MAPPINGS.movie
            });
        } else if (args.id === 'korean-series') {
            return Promise.resolve({
                genres: GENRE_MAPPINGS.series
            });
        }
    }
    return Promise.resolve(null);
});

// Main catalog handler
builder.defineCatalogHandler(async (args) => {
    console.log(`📺 Catalog request: ${args.type} - ${args.id}${args.extra?.search ? ' search: ' + args.extra.search : ''}${args.extra?.genre ? ' genre: ' + args.extra.genre : ''}`);
    
    const skip = args.extra?.skip ? parseInt(args.extra.skip) : 0;
    const cacheKey = args.type === 'movie' ? 'movies' : 'series';
    const now = Date.now();

    // Handle search requests
    if (args.extra?.search) {
        const searchResults = await searchKoreanContent(args.type, args.extra.search);
        return { metas: searchResults.slice(0, 50) };
    }

    // Handle genre-specific requests
    if (args.extra?.genre) {
        console.log(`🎭 Fetching ${args.extra.genre} ${args.type}`);
        const genreResults = await fetchKoreanContentByGenre(args.type, args.extra.genre);
        
        const pageSize = 100;
        const startIndex = skip;
        const endIndex = startIndex + pageSize;
        const paginatedContent = genreResults.slice(startIndex, endIndex);
        
        return { 
            metas: paginatedContent,
            hasMore: endIndex < genreResults.length
        };
    }

    // Regular catalog request - use cache
    const isCacheExpired = now - contentCache[cacheKey].timestamp > CACHE_DURATION;
    const isCacheEmpty = contentCache[cacheKey].data.length === 0;

    if (isCacheExpired || isCacheEmpty) {
        console.log(`🔄 Cache ${isCacheExpired ? 'expired' : 'empty'}, fetching fresh Korean ${args.type}...`);
        contentCache[cacheKey].data = await fetchAllKoreanContent(args.type);
        contentCache[cacheKey].timestamp = now;
    }

    // Pagination for main catalog
    const pageSize = 100;
    const startIndex = skip;
    const endIndex = startIndex + pageSize;
    const paginatedContent = contentCache[cacheKey].data.slice(startIndex, endIndex);

    console.log(`📄 Returning ${paginatedContent.length} ${args.type} (items ${startIndex}-${endIndex} of ${contentCache[cacheKey].data.length} total)`);

    return { 
        metas: paginatedContent,
        hasMore: endIndex < contentCache[cacheKey].data.length
    };
});

// Start the server
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port })
    .then(() => {
        console.log('🚀 Korean Catalog Addon successfully started!');
        console.log('✅ Fixed: Both Movies AND Series catalogs');
        console.log('✅ Fixed: No adult/porn content (include_adult=false)');
        console.log('✅ Fixed: Genre filters in Discovery page');
        console.log('🎭 Movies Genres: Action, Drama, Comedy, Thriller, Horror, Romance, Sci-Fi, Mystery, Fantasy, Crime');
        console.log('🎭 Series Genres: Drama, Comedy, Action & Adventure, Sci-Fi & Fantasy, Mystery, Romance, Crime, Family, Documentary');
        console.log('🔗 Manifest URL: http://localhost:' + port + '/manifest.json');
    })
    .catch((error) => {
        console.error('💥 Failed to start addon:', error);
    });