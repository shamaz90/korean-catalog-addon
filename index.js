const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const builder = new addonBuilder({
    id: 'com.korean.cinemeta',
    version: '1.0.0',
    name: 'Korean Cinemeta',
    description: 'Korean Movies and TV Series Catalog (Cinemeta Style)',
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

// Korean content genres (similar to Cinemeta's approach)
const KOREAN_GENRES = {
    movie: ['Action', 'Drama', 'Comedy', 'Thriller', 'Romance', 'Horror', 'Sci-Fi', 'Fantasy', 'Crime', 'Mystery'],
    series: ['Drama', 'Comedy', 'Action', 'Romance', 'Thriller', 'Crime', 'Fantasy', 'Sci-Fi', 'Mystery', 'Historical']
};

// Fetch Korean content from TMDB (Cinemeta-style)
async function fetchKoreanContent(type, options = {}) {
    const { search, genre, skip = 0 } = options;
    const page = Math.floor(skip / 100) + 1;
    
    try {
        let url;
        
        if (search) {
            // Search endpoint
            url = `https://api.themoviedb.org/3/search/${type}?api_key=a6635913d6574e1d0acf79cacf6db07d&query=${encodeURIComponent(search)}&language=en-US&page=${page}&include_adult=false`;
        } else if (genre) {
            // Genre-based discovery (like Cinemeta)
            const genreMap = {
                'action': 28, 'drama': 18, 'comedy': 35, 'thriller': 53,
                'romance': 10749, 'horror': 27, 'sci-fi': 878, 'fantasy': 14,
                'crime': 80, 'mystery': 9648, 'historical': 36
            };
            const genreId = genreMap[genre.toLowerCase()];
            
            if (genreId) {
                url = `https://api.themoviedb.org/3/discover/${type}?api_key=a6635913d6574e1d0acf79cacf6db07d&with_genres=${genreId}&with_original_language=ko&sort_by=popularity.desc&page=${page}&include_adult=false`;
            } else {
                url = `https://api.themoviedb.org/3/discover/${type}?api_key=a6635913d6574e1d0acf79cacf6db07d&with_original_language=ko&sort_by=popularity.desc&page=${page}&include_adult=false`;
            }
        } else {
            // Popular Korean content (default)
            url = `https://api.themoviedb.org/3/discover/${type}?api_key=a6635913d6574e1d0acf79cacf6db07d&with_original_language=ko&sort_by=popularity.desc&page=${page}&include_adult=false`;
        }

        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results) return { metas: [], hasMore: false };
        
        // Filter and map to Cinemeta-style format
        const metas = data.results
            .filter(item => item.original_language === 'ko') // Korean content only
            .map(item => ({
                id: `tmdb:${item.id}`,
                type: type,
                name: item.title || item.name,
                poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined,
                background: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : undefined,
                description: item.overview,
                releaseInfo: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear().toString() : undefined,
                imdbRating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : undefined,
                genres: item.genre_ids ? getGenreNames(item.genre_ids, type) : undefined
            }));

        const hasMore = data.page < data.total_pages;
        
        return { metas, hasMore };
        
    } catch (error) {
        console.error(`Error fetching Korean ${type}:`, error);
        return { metas: [], hasMore: false };
    }
}

// Helper function to get genre names from IDs
function getGenreNames(genreIds, type) {
    const genreMap = {
        movie: {
            28: 'Action', 18: 'Drama', 35: 'Comedy', 53: 'Thriller',
            10749: 'Romance', 27: 'Horror', 878: 'Sci-Fi', 14: 'Fantasy',
            80: 'Crime', 9648: 'Mystery', 36: 'Historical'
        },
        series: {
            18: 'Drama', 35: 'Comedy', 10759: 'Action', 10749: 'Romance',
            53: 'Thriller', 80: 'Crime', 10765: 'Fantasy', 9648: 'Mystery',
            36: 'Historical'
        }
    };
    
    return genreIds.map(id => genreMap[type][id]).filter(Boolean);
}

// Catalog handler (Cinemeta-style)
builder.defineCatalogHandler(async (args) => {
    console.log('Korean Cinemeta request:', args);
    
    const options = {
        search: args.extra?.search,
        genre: args.extra?.genre,
        skip: args.extra?.skip || 0
    };
    
    return await fetchKoreanContent(args.type, options);
});

// Start the server (Cinemeta-style simple server)
const port = process.env.PORT || 7000;

serveHTTP(builder.getInterface(), { port: port })
    .then(() => {
        console.log('✅ Korean Cinemeta addon running on port', port);
        console.log('✅ Follows Cinemeta pattern');
        console.log('✅ Korean movies and series catalogs');
        console.log('✅ Genre filtering available');
        console.log('✅ Safe content (no adult)');
        console.log('🔗 Manifest:', `http://localhost:${port}/manifest.json`);
    })
    .catch((error) => {
        console.error('❌ Failed to start addon:', error);
    });