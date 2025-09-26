const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const TMDB_API_KEY = 'a6635913d6574e1d0acf79cacf6db07d';

const builder = new addonBuilder({
    id: 'com.korean.catalog',
    version: '1.4.0',
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
            ],
            genres: ['Action', 'Drama', 'Comedy', 'Thriller', 'Horror', 'Romance', 'Sci-Fi', 'Mystery', 'Fantasy', 'Crime']
        },
        {
            type: 'series',
            id: 'korean-series',
            name: 'Korean Series',
            extra: [
                { name: 'search' },
                { name: 'genre' },
                { name: 'skip' }
            ],
            genres: ['Drama', 'Comedy', 'Action & Adventure', 'Sci-Fi & Fantasy', 'Mystery', 'Romance', 'Crime', 'Family', 'Documentary']
        }
    ],
    resources: ['catalog'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'tmdb']
});

// TMDB Genre Mappings
const TMDB_GENRES = {
    movie: {
        28: 'Action',
        18: 'Drama', 
        35: 'Comedy',
        53: 'Thriller',
        27: 'Horror',
        10749: 'Romance',
        878: 'Sci-Fi',
        9648: 'Mystery',
        14: 'Fantasy',
        80: 'Crime'
    },
    series: {
        18: 'Drama',
        35: 'Comedy',
        10759: 'Action & Adventure',
        10765: 'Sci-Fi & Fantasy',
        9648: 'Mystery',
        10749: 'Romance',
        80: 'Crime',
        10751: 'Family',
        99: 'Documentary'
    }
};

// Reverse genre lookup
const GENRE_IDS = {
    movie: {
        'Action': 28,
        'Drama': 18,
        'Comedy': 35,
        'Thriller': 53,
        'Horror': 27,
        'Romance': 10749,
        'Sci-Fi': 878,
        'Mystery': 9648,
        'Fantasy': 14,
        'Crime': 80
    },
    series: {
        'Drama': 18,
        'Comedy': 35,
        'Action & Adventure': 10759,
        'Sci-Fi & Fantasy': 10765,
        'Mystery': 9648,
        'Romance': 10749,
        'Crime': 80,
        'Family': 10751,
        'Documentary': 99
    }
};

// Cache for content
let contentCache = {
    movies: { data: [], timestamp: 0 },
    series: { data: [], timestamp: 0 }
};

const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours

// Fetch ALL Korean content with genre information
async function fetchAllKoreanContent(type) {
    console.log(`Fetching ALL Korean ${type} from TMDB...`);
    
    let allResults = [];
    let page = 1;
    let totalPages = 1;

    try {
        // Get total pages first
        const firstPageUrl = `https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_API_KEY}&language=en-US&page=1&with_original_language=ko&region=KR&sort_by=popularity.desc`;
        const firstResponse = await fetch(firstPageUrl);
        const firstData = await firstResponse.json();
        
        totalPages = Math.min(firstData.total_pages, 30); // Limit to 30 pages for performance
        
        console.log(`Found ${totalPages} pages of Korean ${type}`);

        // Fetch all pages
        for (page = 1; page <= totalPages; page++) {
            const url = `https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_API_KEY}&language=en-US&page=${page}&with_original_language=ko&region=KR&sort_by=popularity.desc`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (!data.results || data.results.length === 0) break;

            const koreanContent = data.results.map(item => {
                // Get genre names from genre IDs
                const genreNames = item.genre_ids ? item.genre_ids.map(genreId => TMDB_GENRES[type][genreId]).filter(Boolean) : [];
                
                return {
                    id: `tmdb:${item.id}`,
                    type: type,
                    name: item.title || item.name,
                    poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                    background: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
                    description: item.overview,
                    releaseInfo: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear().toString() : null,
                    imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null,
                    genres: genreNames,
                    genreIds: item.genre_ids || []
                };
            });

            allResults = allResults.concat(koreanContent);
            console.log(`Page ${page}: Added ${koreanContent.length} ${type}, Total: ${allResults.length}`);
            
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.log(`✅ Successfully fetched ${allResults.length} Korean ${type}`);
        return allResults;
        
    } catch (error) {
        console.error(`❌ Error fetching Korean ${type}:`, error);
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
            .map(item => {
                const genreNames = item.genre_ids ? item.genre_ids.map(genreId => TMDB_GENRES[type][genreId]).filter(Boolean) : [];
                
                return {
                    id: `tmdb:${item.id}`,
                    type: type,
                    name: item.title || item.name,
                    poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                    description: item.overview,
                    releaseInfo: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear().toString() : null,
                    imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null,
                    genres: genreNames
                };
            });
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

// Fetch by specific genre
async function fetchKoreanContentByGenre(type, genreName) {
    const genreId = GENRE_IDS[type][genreName];
    if (!genreId) return [];

    try {
        const url = `https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_API_KEY}&language=en-US&with_original_language=ko&with_genres=${genreId}&region=KR&sort_by=popularity.desc`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results) return [];
        
        return data.results.map(item => {
            const genreNames = item.genre_ids ? item.genre_ids.map(gId => TMDB_GENRES[type][gId]).filter(Boolean) : [];
            
            return {
                id: `tmdb:${item.id}`,
                type: type,
                name: item.title || item.name,
                poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                description: item.overview,
                releaseInfo: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear().toString() : null,
                imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null,
                genres: genreNames
            };
        });
    } catch (error) {
        console.error(`Error fetching ${genreName} ${type}:`, error);
        return [];
    }
}

// Main catalog handler
builder.defineCatalogHandler(async (args) => {
    console.log(`📺 Catalog request: ${args.type}${args.extra?.search ? ' search: ' + args.extra.search : ''}${args.extra?.genre ? ' genre: ' + args.extra.genre : ''}`);
    
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
        console.log('✅ Features: ALL Korean content + Genre filtering in Discovery page');
        console.log('🎭 Movies Genres: Action, Drama, Comedy, Thriller, Horror, Romance, Sci-Fi, Mystery, Fantasy, Crime');
        console.log('🎭 Series Genres: Drama, Comedy, Action & Adventure, Sci-Fi & Fantasy, Mystery, Romance, Crime, Family, Documentary');
        console.log('🔗 Manifest URL: http://localhost:' + port + '/manifest.json');
    })
    .catch((error) => {
        console.error('💥 Failed to start addon:', error);
    });