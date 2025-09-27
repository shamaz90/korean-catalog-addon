const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const builder = new addonBuilder({
    id: 'com.korean.filtered.final',
    version: '1.0.0',
    name: 'Korean Catalog - Safe & Streaming',
    description: 'Korean Movies & Series (No Adult Content + Streaming Only)',
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

// All major streaming platforms
const STREAMING_PLATFORMS = [8, 9, 337, 15, 2, 531, 384, 283, 386, 300];

// Adult content keywords to block
const ADULT_KEYWORDS = [
    'stepmom', 'stepmother', 'desire', 'untangled', 'exchange', 'female wars',
    'leggings', 'mania', 'erotic', 'adult', 'xxx', 'porn', 'sex', 'nude',
    'bed', 'hot', 'seduction', 'affair', 'forbidden', 'mistress'
];

let contentCache = {
    movies: { data: [], count: 0, timestamp: 0 },
    series: { data: [], count: 0, timestamp: 0 }
};
const CACHE_DURATION = 6 * 60 * 60 * 1000;

// Check if content is safe (no adult content)
function isSafeContent(item) {
    if (!item) return false;
    
    const title = (item.title || item.name || '').toLowerCase();
    const overview = (item.overview || '').toLowerCase();
    
    // Block adult keywords
    if (ADULT_KEYWORDS.some(keyword => title.includes(keyword) || overview.includes(keyword))) {
        return false;
    }
    
    // Block adult content flag
    if (item.adult) {
        return false;
    }
    
    return true;
}

// Check if content is on streaming platforms
async function isOnStreamingPlatforms(tmdbId, type) {
    try {
        const url = `https://api.themoviedb.org/3/${type}/${tmdbId}/watch/providers?api_key=a6635913d6574e1d0acf79cacf6db07d`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results || !data.results.US) return false;
        
        // Check streaming platforms
        return STREAMING_PLATFORMS.some(platformId => 
            (data.results.US.flatrate && data.results.US.flatrate.some(p => p.provider_id === platformId)) ||
            (data.results.US.buy && data.results.US.buy.some(p => p.provider_id === platformId)) ||
            (data.results.US.rent && data.results.US.rent.some(p => p.provider_id === platformId))
        );
    } catch (error) {
        return false;
    }
}

// Fetch and filter Korean content
async function fetchFilteredKoreanContent(type) {
    console.log(`Fetching and filtering Korean ${type}...`);
    
    let allContent = [];
    let page = 1;
    let totalFiltered = 0;

    try {
        while (page <= 5) { // Limit to 5 pages for performance
            const url = `https://api.themoviedb.org/3/discover/${type}?api_key=a6635913d6574e1d0acf79cacf6db07d&with_original_language=ko&sort_by=popularity.desc&page=${page}&include_adult=false`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (!data.results || data.results.length === 0) break;

            // Filter for safe Korean content
            const safeContent = data.results.filter(item => 
                item.original_language === 'ko' && isSafeContent(item)
            );

            console.log(`Page ${page}: ${safeContent.length} safe ${type}`);

            // Check streaming availability for each item
            for (const item of safeContent) {
                const isStreaming = await isOnStreamingPlatforms(item.id, type);
                if (isStreaming) {
                    allContent.push({
                        id: `tmdb:${item.id}`,
                        type: type,
                        name: item.title || item.name,
                        poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined,
                        description: item.overview,
                        releaseInfo: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear().toString() : undefined,
                        imdbRating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : undefined,
                        genres: item.genre_ids || []
                    });
                    totalFiltered++;
                }
                
                await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
            }

            if (page >= data.total_pages) break;
            page++;
        }

        console.log(`✅ Final count: ${totalFiltered} ${type} (safe + streaming)`);
        return { content: allContent, count: totalFiltered };

    } catch (error) {
        console.error(`❌ Error fetching ${type}:`, error);
        return { content: [], count: 0 };
    }
}

// Genre mapping
const GENRE_MAP = {
    movie: {
        28: 'Action', 18: 'Drama', 35: 'Comedy', 53: 'Thriller',
        10749: 'Romance', 27: 'Horror', 878: 'Sci-Fi', 14: 'Fantasy',
        80: 'Crime', 9648: 'Mystery'
    },
    series: {
        18: 'Drama', 35: 'Comedy', 10759: 'Action', 10749: 'Romance',
        53: 'Thriller', 80: 'Crime', 10765: 'Fantasy', 9648: 'Mystery'
    }
};

builder.defineCatalogHandler(async (args) => {
    console.log(`📺 Request: ${args.type} - ${args.id}`);
    
    const skip = args.extra?.skip ? parseInt(args.extra.skip) : 0;
    const cacheKey = args.type === 'movie' ? 'movies' : 'series';
    const now = Date.now();

    try {
        // Fetch fresh data if cache is empty or expired
        if (contentCache[cacheKey].data.length === 0 || now - contentCache[cacheKey].timestamp > CACHE_DURATION) {
            console.log(`🔄 Fetching fresh filtered ${args.type}...`);
            const result = await fetchFilteredKoreanContent(args.type);
            contentCache[cacheKey].data = result.content;
            contentCache[cacheKey].count = result.count;
            contentCache[cacheKey].timestamp = now;
            
            console.log(`🎯 TOTAL ${args.type.toUpperCase()} COUNT: ${result.count}`);
        }

        let filteredContent = contentCache[cacheKey].data;

        // Apply genre filter
        if (args.extra?.genre) {
            const genreMap = {
                'action': 28, 'drama': 18, 'comedy': 35, 'thriller': 53,
                'romance': 10749, 'horror': 27, 'scifi': 878, 'fantasy': 14,
                'crime': 80, 'mystery': 9648
            };
            const genreId = genreMap[args.extra.genre.toLowerCase()];
            
            if (genreId) {
                filteredContent = filteredContent.filter(item => 
                    item.genres.includes(genreId)
                );
            }
        }

        // Apply search filter
        if (args.extra?.search) {
            filteredContent = filteredContent.filter(item =>
                item.name.toLowerCase().includes(args.extra.search.toLowerCase())
            );
        }

        // Pagination
        const pageSize = 100;
        const startIndex = skip;
        const endIndex = startIndex + pageSize;
        const paginatedContent = filteredContent.slice(startIndex, endIndex);

        console.log(`📄 Returning ${paginatedContent.length} ${args.type}`);
        
        return { 
            metas: paginatedContent,
            hasMore: endIndex < filteredContent.length
        };

    } catch (error) {
        console.error('❌ Catalog error:', error);
        return { metas: [], hasMore: false };
    }
});

// Start the server
const port = process.env.PORT || 7000;

serveHTTP(builder.getInterface(), { port: port })
    .then(() => {
        console.log('🚀 Korean Catalog - Final Version Started!');
        console.log('✅ Removes adult content not on streaming platforms');
        console.log('✅ Shows exact movie and series counts');
        console.log('✅ Separate catalogs for movies and series');
        console.log('✅ Genre selection in Discovery page');
        console.log('✅ Safe content only');
        console.log('🔗 Manifest: http://localhost:' + port + '/manifest.json');
    })
    .catch((error) => {
        console.error('💥 Failed to start addon:', error);
    });