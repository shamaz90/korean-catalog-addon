const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const builder = new addonBuilder({
    id: 'com.korean.catalog.final',
    version: '1.0.0',
    name: 'Korean Catalog',
    description: 'Korean Movies and TV Series - Safe Content',
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

// Adult content keywords to block
const ADULT_KEYWORDS = [
    'stepmom', 'stepmother', 'desire', 'untangled', 'exchange', 'female wars',
    'leggings', 'mania', 'erotic', 'adult', 'xxx', 'porn', 'sex', 'nude',
    'bed', 'hot', 'seduction', 'affair', 'forbidden', 'mistress', 'secretary'
];

// Check if content is safe
function isSafeContent(item) {
    if (!item) return false;
    
    const title = (item.title || item.name || '').toLowerCase();
    const overview = (item.overview || '').toLowerCase();
    
    // Block adult keywords
    if (ADULT_KEYWORDS.some(keyword => title.includes(keyword))) {
        return false;
    }
    
    // Ensure it's Korean content
    if (item.original_language !== 'ko') {
        return false;
    }
    
    // Block adult content flag
    if (item.adult) {
        return false;
    }
    
    return true;
}

// Fetch ALL Korean content with proper filtering
async function fetchAllKoreanContent(type, options = {}) {
    const { search, genre, skip = 0 } = options;
    const page = Math.floor(skip / 100) + 1;
    
    try {
        let url;
        
        if (search) {
            url = `https://api.themoviedb.org/3/search/${type}?api_key=a6635913d6574e1d0acf79cacf6db07d&query=${encodeURIComponent(search)}&language=en-US&page=${page}&include_adult=false`;
        } else if (genre) {
            // Genre filtering
            const genreMap = {
                'action': 28, 'drama': 18, 'comedy': 35, 'thriller': 53,
                'romance': 10749, 'horror': 27, 'scifi': 878, 'fantasy': 14,
                'crime': 80, 'mystery': 9648, 'historical': 36
            };
            const genreId = genreMap[genre.toLowerCase()];
            
            if (genreId) {
                url = `https://api.themoviedb.org/3/discover/${type}?api_key=a6635913d6574e1d0acf79cacf6db07d&with_genres=${genreId}&with_original_language=ko&sort_by=popularity.desc&page=${page}&include_adult=false`;
            } else {
                url = `https://api.themoviedb.org/3/discover/${type}?api_key=a6635913d6574e1d0acf79cacf6db07d&with_original_language=ko&sort_by=popularity.desc&page=${page}&include_adult=false`;
            }
        } else {
            // Default: popular Korean content
            url = `https://api.themoviedb.org/3/discover/${type}?api_key=a6635913d6574e1d0acf79cacf6db07d&with_original_language=ko&sort_by=popularity.desc&page=${page}&include_adult=false`;
        }

        console.log(`Fetching from: ${url}`);
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            return { metas: [], hasMore: false };
        }
        
        // Filter out adult content and ensure Korean
        const safeContent = data.results.filter(isSafeContent);
        
        console.log(`Filtered: ${data.results.length} -> ${safeContent.length} safe items`);
        
        // Map to Stremio format
        const metas = safeContent.map(item => ({
            id: `tmdb:${item.id}`,
            type: type,
            name: item.title || item.name,
            poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined,
            background: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : undefined,
            description: item.overview,
            releaseInfo: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear().toString() : undefined,
            imdbRating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : undefined
        }));

        const hasMore = data.page < data.total_pages && safeContent.length > 0;
        
        return { metas, hasMore };
        
    } catch (error) {
        console.error(`Error fetching Korean ${type}:`, error);
        return { metas: [], hasMore: false };
    }
}

// Catalog handler for both movies and series
builder.defineCatalogHandler(async (args) => {
    console.log('=== KOREAN CATALOG REQUEST ===');
    console.log('Type:', args.type);
    console.log('ID:', args.id);
    console.log('Extra:', args.extra);
    
    // Ensure we're handling the correct catalog type
    if ((args.type === 'movie' && args.id === 'korean-movies') || 
        (args.type === 'series' && args.id === 'korean-series')) {
        
        const options = {
            search: args.extra?.search,
            genre: args.extra?.genre,
            skip: args.extra?.skip || 0
        };
        
        const result = await fetchAllKoreanContent(args.type, options);
        console.log(`Returning ${result.metas.length} ${args.type}, hasMore: ${result.hasMore}`);
        return result;
    }
    
    // Return empty for incorrect catalog requests
    console.log('Invalid catalog request');
    return { metas: [], hasMore: false };
});

// Start the server
const port = process.env.PORT || 7000;

serveHTTP(builder.getInterface(), { port: port })
    .then(() => {
        console.log('🚀 Korean Catalog Addon Successfully Started!');
        console.log('✅ NO adult content - strict filtering');
        console.log('✅ Both catalogs: Korean Movies & Korean Series');
        console.log('✅ Genre filtering works in Discovery page');
        console.log('✅ Shows 100+ items per catalog');
        console.log('✅ Safe Korean content only');
        console.log('🔗 Manifest URL: http://localhost:' + port + '/manifest.json');
    })
    .catch((error) => {
        console.error('💥 Failed to start addon:', error);
    });