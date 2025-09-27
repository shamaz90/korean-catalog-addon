const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const builder = new addonBuilder({
    id: 'com.korean.streaming.filtered',
    version: '1.0.0',
    name: 'Korean Streaming Catalog',
    description: 'Korean content available on Netflix, Amazon, Disney+, Hulu, Apple, Paramount',
    catalogs: [
        {
            type: 'movie',
            id: 'korean-movies',
            name: 'Korean Movies',
            extra: [{ name: 'search' }, { name: 'genre' }, { name: 'skip' }]
        },
        {
            type: 'series', 
            id: 'korean-series',
            name: 'Korean Series', 
            extra: [{ name: 'search' }, { name: 'genre' }, { name: 'skip' }]
        }
    ],
    resources: ['catalog'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'tmdb']
});

const STREAMING_PLATFORMS = [8, 9, 337, 15, 2, 531]; // Netflix, Amazon, Disney+, Hulu, Apple, Paramount

async function fetchKoreanContentWithStreaming(type, genre = null, page = 1) {
    try {
        // First, get Korean content from TMDB
        let url = `https://api.themoviedb.org/3/discover/${type}?api_key=a6635913d6574e1d0acf79cacf6db07d&with_original_language=ko&page=${page}&include_adult=false`;
        
        if (genre) {
            const genreIds = { action:28, drama:18, comedy:35, thriller:53, romance:10749, horror:27, scifi:878, fantasy:14, crime:80, mystery:9648 };
            if (genreIds[genre]) url += `&with_genres=${genreIds[genre]}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        if (!data.results) return [];
        
        // Check streaming availability for each item
        const streamingContent = [];
        for (const item of data.results.slice(0, 20)) { // Limit to 20 for performance
            try {
                const providersUrl = `https://api.themoviedb.org/3/${type}/${item.id}/watch/providers?api_key=a6635913d6574e1d0acf79cacf6db07d`;
                const providersResponse = await fetch(providersUrl);
                const providersData = await providersResponse.json();
                
                if (providersData.results?.US?.flatrate) {
                    const hasStreaming = providersData.results.US.flatrate.some(provider => 
                        STREAMING_PLATFORMS.includes(provider.provider_id)
                    );
                    if (hasStreaming) streamingContent.push(item);
                }
            } catch (e) {
                continue; // Skip if provider check fails
            }
        }
        
        return streamingContent;
    } catch (error) {
        console.error('Error:', error);
        return [];
    }
}

builder.defineCatalogHandler(async (args) => {
    const content = await fetchKoreanContentWithStreaming(args.type, args.extra?.genre);
    
    const metas = content.map(item => ({
        id: `tmdb:${item.id}`,
        type: args.type,
        name: item.title || item.name,
        poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined,
        description: item.overview,
        releaseInfo: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear().toString() : undefined
    }));
    
    return { metas, hasMore: false };
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });