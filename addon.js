const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const axios = require("axios");
const express = require("express");

const TMDB_API_KEY = "a6635913d6574e1d0acf79cacf6db07d";

const manifest = {
    id: "org.korean.cinemeta",
    version: "1.0.0",
    name: "Korean Cinemeta",
    description: "Catalog addon for Korean Movies and Series using TMDB",
    types: ["movie", "series"],
    catalogs: [
        {
            type: "movie",
            id: "korean-movies",
            name: "Korean Movies",
            extra: [
                { name: "genre", isRequired: false },
                { name: "skip", isRequired: false }
            ]
        },
        {
            type: "series",
            id: "korean-series",
            name: "Korean Series",
            extra: [
                { name: "genre", isRequired: false },
                { name: "skip", isRequired: false }
            ]
        }
    ],
    resources: ["catalog"],
    idPrefixes: ["tmdb"]
};

const builder = new addonBuilder(manifest);

async function fetchTMDBCatalog(type, genre, skip) {
    const page = skip ? Math.floor(skip / 20) + 1 : 1;
    let url = `https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_API_KEY}&with_original_language=ko&sort_by=popularity.desc&page=${page}`;
    if (genre) {
        url += `&with_genres=${genre}`;
    }

    const response = await axios.get(url);
    return response.data.results.map(item => ({
        id: "tmdb_" + item.id,
        type: type === "movie" ? "movie" : "series",
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
        const metas = await fetchTMDBCatalog(tmdbType, extra.genre, extra.skip);
        return { metas };
    }
    return { metas: [] };
});

const app = express();
app.use("/", getRouter(builder.getInterface()));
app.listen(process.env.PORT || 7000);
