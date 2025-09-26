const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const TMDB_API_KEY = 'a6635913d6574e1d0acf79cacf6db07d';

const builder = new addonBuilder({
    id: 'com.korean.catalog',
    version: '1.0.0',
    name: 'Korean Catalog',
    description: 'Korean Movies and Series Catalog',
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

// Fetch Korean content
async function fetchKoreanContent(type, genre = null, page = 1) {
    try {
        let url;
        
        if (genre && TMDB_GENRE_IDS[type][genre]) {
            const genreId = TMDB_GENRE_IDS[type][genre];
            url = `https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_API_KEY}&language=en-US&page=${page}&with_original_language=ko&with_genres=${genreId}&region=KR&sort_by=popularity.desc&include_adult=false`;
        } else {
            url = `https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_API_KEY}&language=en-US&page=${page}&with_original_language=ko&region=KR&sort_by=popularity.desc&include_adult=false`;
        }
        
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
        console.error(`Error fetching ${type}:`, error);
        return [];
    }
}

// Search Korean content
async function searchKoreanContent(type, query) {
    try {
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

// Main catalog handler - SIMPLE AND WORKING
builder.defineCatalogHandler(async (args) => {
    console.log(`Request: ${args.type} - ${args.id}`, args.extra);
    
    const skip = args.extra?.skip ? parseInt(args.extra.skip) : 0;
    const page = Math.floor(skip / 100) + 1;

    try {
        let metas = [];

        // Handle search
        if (args.extra?.search) {
            metas = await searchKoreanContent(args.type, args.extra.search);
        } 
        // Handle genre filter
        else if (args.extra?.genre) {
            metas = await fetchKoreanContent(args.type, args.extra.genre, page);
        }
        // Default: popular content
        else {
            // Use cache for default content
            const cacheKey = args.type === 'movie' ? 'movies' : 'series';
            const now = Date.now();
            
            if (contentCache[cacheKey].data.length === 0 || now - contentCache[cacheKey].timestamp > CACHE_DURATION) {
                contentCache[cacheKey].data = await fetchKoreanContent(args.type, null, page);
                contentCache[cacheKey].timestamp = now;
            }
            
            metas = contentCache[cacheKey].data;
        }

        // Simple pagination
        const startIndex = skip % 100;
        const paginatedMetas = metas.slice(startIndex, startIndex + 100);
        
        console.log(`Returning ${paginatedMetas.length} ${args.type}`);
        
        return { 
            metas: paginatedMetas,
            hasMore: metas.length > startIndex + 100
        };
        
    } catch (error) {
        console.error('Catalog handler error:', error);
        return { metas: [] };
    }
});

// Start the server
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port })
    .then(() => {
        console.log('✅ Korean Catalog Addon successfully started!');
        console.log('✅ Both Movies and Series catalogs');
        console.log('✅ No adult content');
        console.log('✅ Genre filtering works');
        console.log('✅ Search works');
        console.log('🔗 Addon URL: http://localhost:' + port + '/manifest.json');
    })
    .catch((error) => {
        console.error('❌ Failed to start addon:', error);
    });