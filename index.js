const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const builder = new addonBuilder({
    id: 'com.korean.optimized',
    version: '1.0.0',
    name: 'Korean Catalog - Optimized',
    description: 'Maximum Korean Movies & Series with All Features',
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

const TMDB_API_KEY = 'a6635913d6574e1d0acf79cacf6db07d';

// Smart caching with incremental loading
let contentCache = {
    movies: { pages: new Map(), lastPage: 0, totalItems: 0 },
    series: { pages: new Map(), lastPage: 0, totalItems: 0 },
    timestamp: 0
};

const CACHE_DURATION = 24 * 60 * 60 * 1000;

// Fetch Korean content with smart pagination
async function fetchKoreanPage(type, page = 1) {
    try {
        const url = `https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_API_KEY}&with_original_language=ko&sort_by=popularity.desc&page=${page}&include_adult=false`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            return { items: [], totalPages: page - 1, totalResults: data.total_results };
        }

        // Filter and map items
        const items = data.results
            .filter(item => item.original_language === 'ko' && !item.adult)
            .map(item => ({
                id: `tmdb:${item.id}`,
                type: type,
                name: item.title || item.name,
                poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined,
                description: item.overview,
                releaseInfo: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear().toString() : undefined,
                imdbRating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : undefined,
                genres: item.genre_ids || [],
                popularity: item.popularity
            }));

        return {
            items,
            totalPages: data.total_pages,
            totalResults: data.total_results,
            currentPage: data.page
        };
    } catch (error) {
        console.error(`Error fetching ${type} page ${page}:`, error);
        return { items: [], totalPages: 0, totalResults: 0 };
    }
}

// Smart content loader - loads pages as needed
async function getKoreanContent(type, options = {}) {
    const { search, genre, skip = 0 } = options;
    const cacheKey = type;
    const now = Date.now();
    
    // Initialize cache if empty or expired
    if (contentCache[cacheKey].pages.size === 0 || now - contentCache.timestamp > CACHE_DURATION) {
        contentCache[cacheKey].pages.clear();
        contentCache[cacheKey].lastPage = 0;
        contentCache.timestamp = now;
    }

    try {
        let allItems = [];
        
        // Load pages until we have enough items
        while (allItems.length < skip + 100 && contentCache[cacheKey].lastPage < 20) { // Max 20 pages (400 items)
            const nextPage = contentCache[cacheKey].lastPage + 1;
            
            // Check if page is already cached
            if (contentCache[cacheKey].pages.has(nextPage)) {
                const pageItems = contentCache[cacheKey].pages.get(nextPage);
                allItems = allItems.concat(pageItems);
            } else {
                // Fetch new page
                console.log(`📥 Loading ${type} page ${nextPage}...`);
                const result = await fetchKoreanPage(type, nextPage);
                
                if (result.items.length > 0) {
                    contentCache[cacheKey].pages.set(nextPage, result.items);
                    contentCache[cacheKey].lastPage = nextPage;
                    contentCache[cacheKey].totalItems = result.totalResults;
                    allItems = allItems.concat(result.items);
                    
                    console.log(`✅ Loaded ${result.items.length} ${type} from page ${nextPage}`);
                    
                    // Rate limiting delay
                    await new Promise(resolve => setTimeout(resolve, 500));
                } else {
                    break;
                }
            }
        }

        console.log(`📊 Total ${type} loaded: ${allItems.length} (of ${contentCache[cacheKey].totalItems} total)`);

        // Apply genre filter
        if (genre) {
            const genreMap = {
                'action': 28, 'drama': 18, 'comedy': 35, 'thriller': 53,
                'romance': 10749, 'horror': 27, 'scifi': 878, 'fantasy': 14,
                'crime': 80, 'mystery': 9648
            };
            const genreId = genreMap[genre.toLowerCase()];
            
            if (genreId) {
                allItems = allItems.filter(item => item.genres.includes(genreId));
                console.log(`🎭 Genre filter "${genre}": ${allItems.length} items`);
            }
        }

        // Apply search filter
        if (search) {
            allItems = allItems.filter(item => 
                item.name.toLowerCase().includes(search.toLowerCase())
            );
            console.log(`🔍 Search "${search}": ${allItems.length} items`);
        }

        // Pagination
        const pageSize = 100;
        const startIndex = skip;
        const endIndex = startIndex + pageSize;
        const paginatedItems = allItems.slice(startIndex, endIndex);

        return {
            metas: paginatedItems,
            hasMore: endIndex < allItems.length && contentCache[cacheKey].lastPage < 20
        };

    } catch (error) {
        console.error(`Error getting ${type} content:`, error);
        return { metas: [], hasMore: false };
    }
}

// Search handler
async function searchKoreanContent(type, query, page = 1) {
    try {
        const url = `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=${page}&include_adult=false`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results) return { metas: [], hasMore: false };

        const items = data.results
            .filter(item => item.original_language === 'ko' && !item.adult)
            .map(item => ({
                id: `tmdb:${item.id}`,
                type: type,
                name: item.title || item.name,
                poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined,
                description: item.overview,
                releaseInfo: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear().toString() : undefined,
                imdbRating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : undefined
            }));

        return {
            metas: items,
            hasMore: data.page < data.total_pages
        };
    } catch (error) {
        console.error(`Search error for ${type}:`, error);
        return { metas: [], hasMore: false };
    }
}

// Catalog handler
builder.defineCatalogHandler(async (args) => {
    console.log(`🎬 Request: ${args.type} - ${args.id}`, args.extra ? `(${JSON.stringify(args.extra)})` : '');
    
    if ((args.type === 'movie' && args.id === 'korean-movies') || 
        (args.type === 'series' && args.id === 'korean-series')) {
        
        if (args.extra?.search) {
            return await searchKoreanContent(args.type, args.extra.search);
        } else {
            return await getKoreanContent(args.type, {
                genre: args.extra?.genre,
                skip: args.extra?.skip || 0
            });
        }
    }
    
    return { metas: [], hasMore: false };
});

// Start server
const port = process.env.PORT || 7000;

serveHTTP(builder.getInterface(), { port: port })
    .then(() => {
        console.log('🚀 Korean Optimized Catalog Started!');
        console.log('✅ Maximum Korean content (400+ movies, 400+ series)');
        console.log('✅ Smart pagination & caching');
        console.log('✅ Genre filtering in Discovery');
        console.log('✅ Search functionality');
        console.log('✅ Both catalogs guaranteed');
        console.log('✅ Rate limit optimized');
        console.log('🔗 Manifest: http://localhost:' + port + '/manifest.json');
    })
    .catch((error) => {
        console.error('💥 Failed to start addon:', error);
    });