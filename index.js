const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

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

builder.defineCatalogHandler(async (args) => {
    console.log('Catalog request for:', args.type);
    
    // Simple test content - we'll add TMDB later
    const testMovies = [
        {
            id: 'tmdb:496243',
            type: 'movie',
            name: 'Parasite',
            poster: 'https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg',
            description: 'Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.',
            releaseInfo: '2019'
        },
        {
            id: 'tmdb:572802',
            type: 'movie',
            name: 'The Wailing',
            poster: 'https://image.tmdb.org/t/p/w500/wwbgpbSxjw6Yt4bM4u8moWqUENx.jpg',
            description: 'A stranger arrives in a little village and soon after a mysterious sickness starts spreading. A policeman is drawn into the incident.',
            releaseInfo: '2016'
        },
        {
            id: 'tmdb:490132',
            type: 'movie',
            name: 'Train to Busan',
            poster: 'https://image.tmdb.org/t/p/w500/qWOkfCgioDXV73Bk6qSQnP6qoUI.jpg',
            description: 'While a zombie virus breaks out in South Korea, passengers struggle to survive on the train from Seoul to Busan.',
            releaseInfo: '2016'
        }
    ];

    const testSeries = [
        {
            id: 'tmdb:94796',
            type: 'series',
            name: 'Squid Game',
            poster: 'https://image.tmdb.org/t/p/w500/dDlEmu3EZ0Pgg93K2SVNLCjCSvE.jpg',
            description: 'Hundreds of cash-strapped players accept a strange invitation to compete in children\'s games.',
            releaseInfo: '2021'
        },
        {
            id: 'tmdb:104148',
            type: 'series',
            name: 'Crash Landing on You',
            poster: 'https://image.tmdb.org/t/p/w500/5qFc7nNK8Xsslam5p0u7xV7M2aM.jpg',
            description: 'A South Korean heiress accidentally paraglides into North Korea and meets an army officer who decides to help her hide.',
            releaseInfo: '2019'
        },
        {
            id: 'tmdb:94954',
            type: 'series',
            name: 'Vincenzo',
            poster: 'https://image.tmdb.org/t/p/w500/dB6a6d1x3k9bgqcjYQq29q7x9dM.jpg',
            description: 'During a visit to his motherland, a Korean-Italian mafia lawyer gives an unrivaled conglomerate a taste of its own medicine with a side of justice.',
            releaseInfo: '2021'
        }
    ];

    if (args.type === 'movie') {
        return { metas: testMovies };
    } else if (args.type === 'series') {
        return { metas: testSeries };
    }
    
    return { metas: [] };
});

const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port })
    .then(() => {
        console.log('Korean Catalog Addon running on port', port);
    })
    .catch((error) => {
        console.error('Error starting addon:', error);
    });