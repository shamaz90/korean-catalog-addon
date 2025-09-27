const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const builder = new addonBuilder({
    id: 'com.korean.streaming',
    version: '1.0.0',
    name: 'Korean Streaming Catalog',
    description: 'Korean Movies & Series Available on Streaming Platforms',
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

// Streaming platform IDs from TMDB
const STREAMING_PLATFORMS = {
    netflix: 8,
    amazon: 9,
    disney: 337,
    hulu: 15,
    apple: 2,
    paramount: 531
};

// Genre mappings
const GENRES = {
    movie: ['Action', 'Drama', 'Comedy', 'Thriller', 'Romance', 'Horror', 'Sci-Fi', 'Fantasy', 'Crime', 'Mystery'],
    series: ['Drama', 'Comedy', 'Action', 'Romance', 'Thriller', 'Crime', 'Fantasy', 'Sci-Fi', 'Mystery', 'Historical']
};

// Cache for streaming availability
let availabilityCache = {
    movies: new Map(),
    series: new Map(),
    lastUpdated: 0
};

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Check if content is available on streaming platforms
async function checkStreamingAvailability(tmdbId, type) {
    const now = Date.now();
    const cacheKey = `${type}-${tmdbId}`;
    
    // Check cache first
    if (availabilityCache[type].has(cacheKey) && now - availabilityCache.lastUpdated < CACHE_DURATION) {
        return availabilityCache[type].get(cacheKey);
    }

    try {
        const url = `https://api.themoviedb.org/3/${type}/${tmdbId}/watch/providers?api_key=a6635913d6574e1d0acf79cacf6db07d`;
        const response = await fetch(url);
        const data = await response.json();
        
        const isAvailable = data.results && data.results.US && 
            Object.values(STREAMING_PLATFORMS).some(platformId => 
                data.results.US.flatrate && data.results.US.flatrate.some(provider => provider.provider_id === platformId)
            );
        
        // Cache the result
        availabilityCache[type].set(cacheKey, isAvailable);
        if (now - availabilityCache.lastUpdated > CACHE_DURATION) {
            availabilityCache.lastUpdated = now;
        }
        
        return isAvailable;
    } catch (error) {
        console.error(`Error checking streaming availability for ${tmdbId}:`, error);
        return false;
    }
}

// Fetch Korean content available on streaming platforms
async function fetchStreamingKoreanContent(type, options = {}) {
    const { search, genre, skip = 0 } = options;
    const page = Math.floor(skip / 20) + 1;
    
    try {
        let url;
        
        if (search) {
            url = `https://api.themoviedb.org/3/search/${type}?api_key=a6635913d6574e1d0acf79cacf6db07d&query=${encodeURIComponent(search)}&language=en-US&page=${page}&include_adult=false`;
        } else if (genre) {
            const genreMap = {
                'action': 28, 'drama': 18, 'comedy': 35, 'thriller': 53,
                'romance': 10749, 'horror': 27, 'scifi': 878, 'fantasy': 14,
                'crime': 80, 'mystery': 9648
            };
            const genreId = genreMap[genre.toLowerCase()];
            
            url = `https://api.themoviedb.org/3/discover/${type}?api_key=a6635913d6574e1d0acf79cacf6db07d&with_original_language=ko&sort_by=popularity.desc&page=${page}&include_adult=false${genreId ? `&with_genres=${genreId}` : ''}`;
        } else {
            url = `https://api.themoviedb.org/3/discover/${type}?api_key=a6635913d6574e1d0acf79cacf6db07d&with_original_language=ko&sort_by=popularity.desc&page=${page}&include_adult=false`;
        }

        console.log(`Fetching Korean ${type} from: ${url}`);
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            return { metas: [], hasMore: false };
        }

        // Filter for Korean content and check streaming availability
        const koreanContent = data.results.filter(item => 
            item.original_language === 'ko' && !item.adult
        );

        console.log(`Found ${koreanContent.length} Korean ${type}, checking streaming availability...`);

        // Check streaming availability for each item
        const streamingContent = [];
        for (const item of koreanContent) {
            const isAvailable = await checkStreamingAvailability(item.id, type);
            if (isAvailable) {
                streamingContent.push(item);
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`${streamingContent.length} ${type} available on streaming platforms`);

        // Map to Stremio format
        const metas = streamingContent.map(item => ({
            id: `tmdb:${item.id}`,
            type: type,
            name: item.title || item.name,
            poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined,
            description: item.overview,
            releaseInfo: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear().toString() : undefined,
            imdbRating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : undefined
        }));

        const hasMore = data.page < data.total_pages;
        
        return { metas, hasMore };
        
    } catch (error) {
        console.error(`Error fetching streaming Korean ${type}:`, error);
        return { metas: [], hasMore: false };
    }
}

// Catalog handler
builder.defineCatalogHandler(async (args) => {
    console.log('=== KOREAN STREAMING CATALOG ===');
    console.log('Type:', args.type);
    console.log('ID:', args.id);
    console.log('Extra:', args.extra);
    
    if ((args.type === 'movie' && args.id === 'korean-movies') || 
        (args.type === 'series' && args.id === 'korean-series')) {
        
        const result = await fetchStreamingKoreanContent(args.type, {
            search: args.extra?.search,
            genre: args.extra?.genre,
            skip: args.extra?.skip || 0
        });
        
        console.log(`Returning ${result.metas.length} streaming ${args.type}`);
        return result;
    }
    
    return { metas: [], hasMore: false };
});

// Start the server
const port = process.env.PORT || 7000;

serveHTTP(builder.getInterface(), { port: port })
    .then(() => {
        console.log('🚀 Korean Streaming Catalog Started!');
        console.log('✅ Only content available on: Netflix, Amazon, Disney+, Hulu, Apple TV+, Paramount+');
        console.log('✅ No adult content (professional streaming platforms)');
        console.log('✅ Both catalogs: Movies & Series');
        console.log('✅ Genre filtering available');
        console.log('✅ High-quality, legally available content');
        console.log('🔗 Manifest: http://localhost:' + port + '/manifest.json');
    })
    .catch((error) => {
        console.error('❌ Failed to start addon:', error);
    });