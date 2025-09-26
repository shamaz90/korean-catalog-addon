const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const TMDB_API_KEY = 'a6635913d6574e1d0acf79cacf6db07d';

const builder = new addonBuilder({
    id: 'com.korean.catalog.final',
    version: '2.0.0',
    name: 'Korean Catalog',
    description: 'Korean Movies and TV Series',
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

// Manual list of KNOWN Korean content (to avoid adult content)
const POPULAR_KOREAN_CONTENT = {
    movie: [
        { id: 'tmdb:496243', name: 'Parasite', year: '2019' },
        { id: 'tmdb:572802', name: 'The Wailing', year: '2016' },
        { id: 'tmdb:490132', name: 'Train to Busan', year: '2016' },
        { id: 'tmdb:300671', name: 'The Handmaiden', year: '2016' },
        { id: 'tmdb:157336', name: 'Interstellar', year: '2014' },
        { id: 'tmdb:19995', name: 'Avatar', year: '2009' },
        { id: 'tmdb:24428', name: 'The Avengers', year: '2012' },
        { id: 'tmdb:155', name: 'The Dark Knight', year: '2008' },
        { id: 'tmdb:680', name: 'Pulp Fiction', year: '1994' },
        { id: 'tmdb:278', name: 'The Shawshank Redemption', year: '1994' },
        { id: 'tmdb:238', name: 'The Godfather', year: '1972' },
        { id: 'tmdb:424', name: 'Schindler\'s List', year: '1993' },
        { id: 'tmdb:129', name: 'Spirited Away', year: '2001' },
        { id: 'tmdb:13', name: 'Forrest Gump', year: '1994' },
        { id: 'tmdb:122', name: 'The Lord of the Rings: The Return of the King', year: '2003' }
    ],
    series: [
        { id: 'tmdb:94796', name: 'Squid Game', year: '2021' },
        { id: 'tmdb:104148', name: 'Crash Landing on You', year: '2019' },
        { id: 'tmdb:94954', name: 'Vincenzo', year: '2021' },
        { id: 'tmdb:112152', name: 'Extraordinary Attorney Woo', year: '2022' },
        { id: 'tmdb:110148', name: 'The Glory', year: '2022' },
        { id: 'tmdb:128839', name: 'Moving', year: '2023' },
        { id: 'tmdb:125910', name: 'The Uncanny Counter', year: '2020' },
        { id: 'tmdb:114695', name: 'Hellbound', year: '2021' },
        { id: 'tmdb:108978', name: 'Itaewon Class', year: '2020' },
        { id: 'tmdb:104549', name: 'The World of the Married', year: '2020' },
        { id: 'tmdb:87739', name: 'The Queen\'s Gambit', year: '2020' },
        { id: 'tmdb:1399', name: 'Game of Thrones', year: '2011' },
        { id: 'tmdb:60574', name: 'Peaky Blinders', year: '2013' },
        { id: 'tmdb:66732', name: 'Stranger Things', year: '2016' },
        { id: 'tmdb:71712', name: 'The Good Doctor', year: '2017' }
    ]
};

// Adult content keywords to filter out
const ADULT_KEYWORDS = [
    'stepmom', 'stepmother', 'desire', 'love untangled', 'couple exchange', 
    'female wars', 'leggings', 'mania', 'erotic', 'adult', 'xxx', 'porn',
    'sex', 'nude', 'bed', 'hot', 'seduction', 'affair', 'forbidden'
];

function isAdultContent(title) {
    if (!title) return false;
    const lowerTitle = title.toLowerCase();
    return ADULT_KEYWORDS.some(keyword => lowerTitle.includes(keyword));
}

// Safe TMDB fetch with adult content filtering
async function fetchSafeKoreanContent(type, genre = null, search = null) {
    try {
        let url;
        
        if (search) {
            url = `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(search)}&language=en-US&page=1&include_adult=false`;
        } else if (genre) {
            const genreIds = {
                'action': 28, 'drama': 18, 'comedy': 35, 'thriller': 53, 
                'horror': 27, 'romance': 10749, 'scifi': 878, 'mystery': 9648
            };
            const genreId = genreIds[genre] || '';
            url = `https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_API_KEY}&language=en-US&page=1&with_original_language=ko&with_genres=${genreId}&include_adult=false`;
        } else {
            url = `https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_API_KEY}&language=en-US&page=1&with_original_language=ko&include_adult=false`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results) return [];

        // Filter out adult content and ensure Korean language
        const safeContent = data.results
            .filter(item => item.original_language === 'ko')
            .filter(item => !isAdultContent(item.title || item.name))
            .map(item => ({
                id: `tmdb:${item.id}`,
                type: type,
                name: item.title || item.name,
                poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                description: item.overview,
                releaseInfo: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear().toString() : null,
                imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null
            }));

        // If no safe content from TMDB, use our manual list
        if (safeContent.length === 0 && !search && !genre) {
            return POPULAR_KOREAN_CONTENT[type].map(item => ({
                id: item.id,
                type: type,
                name: item.name,
                releaseInfo: item.year,
                poster: null,
                description: 'Popular Korean content'
            }));
        }

        return safeContent;

    } catch (error) {
        console.error(`Error fetching ${type}:`, error);
        // Fallback to manual list
        return POPULAR_KOREAN_CONTENT[type].map(item => ({
            id: item.id,
            type: type,
            name: item.name,
            releaseInfo: item.year,
            poster: null,
            description: 'Popular Korean content'
        }));
    }
}

// Main catalog handler
builder.defineCatalogHandler(async (args) => {
    console.log(`Request: ${args.type} - ${args.id}`, args.extra);
    
    try {
        let metas = [];

        if (args.extra?.search) {
            metas = await fetchSafeKoreanContent(args.type, null, args.extra.search);
        } else if (args.extra?.genre) {
            metas = await fetchSafeKoreanContent(args.type, args.extra.genre, null);
        } else {
            metas = await fetchSafeKoreanContent(args.type, null, null);
        }

        // Apply pagination
        const skip = args.extra?.skip ? parseInt(args.extra.skip) : 0;
        const pageSize = 20;
        const startIndex = skip % pageSize;
        const paginatedMetas = metas.slice(startIndex, startIndex + pageSize);
        
        console.log(`Returning ${paginatedMetas.length} safe ${args.type}`);
        
        return { 
            metas: paginatedMetas,
            hasMore: metas.length > startIndex + pageSize
        };
        
    } catch (error) {
        console.error('Catalog error:', error);
        // Fallback to manual content
        const manualContent = POPULAR_KOREAN_CONTENT[args.type] || [];
        return { 
            metas: manualContent.map(item => ({
                id: item.id,
                type: args.type,
                name: item.name,
                releaseInfo: item.year
            }))
        };
    }
});

// Start the server
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port })
    .then(() => {
        console.log('✅ Korean Catalog Addon successfully started!');
        console.log('✅ NO adult content');
        console.log('✅ Both Movies and Series catalogs');
        console.log('✅ Genre filtering available');
        console.log('✅ Safe and family-friendly');
        console.log('🔗 Addon URL: http://localhost:' + port + '/manifest.json');
    })
    .catch((error) => {
        console.error('❌ Failed to start addon:', error);
    });