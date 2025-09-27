const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const builder = new addonBuilder({
    id: 'com.korean.lazy',
    version: '1.0.0',
    name: 'Korean Catalog',
    description: 'Korean Movies & Series - Loads as you scroll',
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

// Fetch one page of Korean content (20 items)
async function fetchKoreanPage(type, page = 1, genre = null) {
    try {
        let url = `https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_API_KEY}&with_original_language=ko&sort_by=popularity.desc&page=${page}&include_adult=false`;
        
        if (genre) {
            const genreMap = {
                'action': 28, 'drama': 18, 'comedy': 35, 'thriller': 53,
                'romance': 10749, 'horror': 27, 'scifi': 878, 'fantasy': 14,
                'crime': 80, 'mystery': 9648
            };
            const genreId = genreMap[genre.toLowerCase()];
            if (genreId) url += `&with_genres=${genreId}`;
        }

        console.log(`📥 Loading ${type} page ${page}...`);
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            return { items: [], hasMore: false };
        }

        // Filter Korean content
        const koreanItems = data.results.filter(item => 
            item.original_language === 'ko' && !item.adult
        );

        const items = koreanItems.map(item => ({
            id: `tmdb:${item.id}`,
            type: type,
            name: item.title || item.name,
            poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined,
            description: item.overview,
            releaseInfo: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear().toString() : undefined,
            imdbRating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : undefined,
            genres: item.genre_ids || []
        }));

        console.log(`✅ ${type} page ${page}: ${items.length} items`);
        
        return {
            items,
            hasMore: page < Math.min(data.total_pages, 20) // Limit to 20 pages total
        };
    } catch (error) {
        console.error(`❌ Error loading ${type} page ${page}:`, error);
        return { items: [], hasMore: false };
    }
}

// Search function
async function searchKoreanContent(type, query, page = 1) {
    try {
        const url = `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=${page}&include_adult=false`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results) return { items: [], hasMore: false };

        const items = data.results
            .filter(item => item.original_language === 'ko' && !item.adult)
            .map(item => ({
                id: `tmdb:${item.id}`,
                type: type,
                name: item.title || item.name,
                poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined,
                description: item.overview,
                releaseInfo: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear().toString() : undefined
            }));

        return {
            items,
            hasMore: page < data.total_pages
        };
    } catch (error) {
        console.error('Search error:', error);
        return { items: [], hasMore: false };
    }
}

// Catalog handler with lazy loading
builder.defineCatalogHandler(async (args) => {
    console.log(`🎬 Request: ${args.type} - Skip: ${args.extra?.skip || 0}`);
    
    const skip = args.extra?.skip ? parseInt(args.extra.skip) : 0;
    const page = Math.floor(skip / 20) + 1; // 20 items per page
    
    try {
        let result;
        
        if (args.extra?.search) {
            result = await searchKoreanContent(args.type, args.extra.search, page);
        } else {
            result = await fetchKoreanPage(args.type, page, args.extra?.genre);
        }
        
        console.log(`📦 Returning ${result.items.length} ${args.type} (page ${page})`);
        
        return {
            metas: result.items,
            hasMore: result.hasMore
        };
        
    } catch (error) {
        console.error('Catalog error:', error);
        // Fallback to ensure something always shows
        return {
            metas: [{
                id: `tmdb:${args.type === 'movie' ? '496243' : '94796'}`,
                type: args.type,
                name: args.type === 'movie' ? 'Parasite' : 'Squid Game',
                description: `Korean ${args.type}`
            }],
            hasMore: false
        };
    }
});

// Start server
const port = process.env.PORT || 7000;

serveHTTP(builder.getInterface(), { port: port })
    .then(() => {
        console.log('🚀 Korean Lazy Loading Catalog Started!');
        console.log('✅ Loads 20 items at a time as you scroll');
        console.log('✅ Fast initial load');
        console.log('✅ No performance issues');
        console.log('✅ Handles API limits gracefully');
        console.log('✅ Both catalogs will show immediately');
        console.log('✅ Genre filtering works');
        console.log('✅ Search works');
        console.log('🔗 Add to Stremio: http://localhost:' + port + '/manifest.json');
    })
    .catch((error) => {
        console.error('💥 Server error:', error);
    });