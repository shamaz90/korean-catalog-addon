
const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');

const TMDB_API_KEY = 'a6635913d6574e1d0acf79cacf6db07d';
const MDBLIST_API_KEY = 'cw16juzfhfoma0p02oqi4jci0';

const builder = new addonBuilder(manifest);

const manifest = {
    id: "org.korean.cinemeta",
    version: "1.0.0",
    name: "Korean Cinemeta",
    description: "Catalog addon for Korean Movies and Series using TMDB and mdblist",
    types: ["movie", "series"],
    catalogs: [
        {
            type: "movie",
            id: "korean-movies",
            name: "Korean Movies",
            extra: [
                { name: "search", isRequired: false },
                { name: "genre", isRequired: false }
            ]
        },
        {
            type: "series",
            id: "korean-series",
            name: "Korean Series",
            extra: [
                { name: "search", isRequired: false },
                { name: "genre", isRequired: false }
            ]
        }
    ],
    resources: ["catalog"],
    idPrefixes: ["tmdb"]
};

async function fetchTMDBCatalog(type, search) {
    const url = `https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_API_KEY}&with_original_language=ko&sort_by=popularity.desc`;
    const response = await axios.get(url);
    return response.data.results.map(item => ({
        id: "tmdb_" + item.id,
        type: type,
        name: item.title || item.name,
        poster: item.poster_path ? "https://image.tmdb.org/t/p/w500" + item.poster_path : null,
        background: item.backdrop_path ? "https://image.tmdb.org/t/p/w780" + item.backdrop_path : null,
        description: item.overview,
        releaseInfo: item.release_date || item.first_air_date
    }));
}

builder.defineCatalogHandler(async ({ type, id, extra }) => {
    if (id === "korean-movies" || id === "korean-series") {
        const tmdbType = type === "movie" ? "movie" : "tv";
        const metas = await fetchTMDBCatalog(tmdbType, extra.search);
        return { metas };
    }
    return { metas: [] };
});

module.exports = builder.getInterface();
