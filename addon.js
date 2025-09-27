const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const axios = require("axios");
const express = require("express");

const TMDB_API_KEY = "a6635913d6574e1d0acf79cacf6db07d";

const GENRE_MAP = {
    movie: {
        "Action": 28, "Adventure": 12, "Animation": 16, "Comedy": 35, "Crime": 80,
        "Documentary": 99, "Drama": 18, "Family": 10751, "Fantasy": 14, "History": 36,
        "Horror": 27, "Music": 10402, "Mystery": 9648, "Romance": 10749, "Science Fiction": 878,
        "TV Movie": 10770, "Thriller": 53, "War": 10752, "Western": 37
    },
    series: {
        "Action & Adventure": 10759, "Animation": 16, "Comedy": 35, "Crime": 80,
        "Documentary": 99, "Drama": 18, "Family": 10751, "Kids": 10762, "Mystery": 9648,
        "News": 10763, "Reality": 10764, "Sci-Fi & Fantasy": 10765, "Soap": 10766,
        "Talk": 10767, "War & Politics": 10768, "Western": 37
    }
};

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
                { name: "genre", options: Object.keys(GENRE_MAP.movie), isRequired: false },
                { name: "skip", isRequired: false }
            ]
        },
        {
            type: "series",
            id: "korean-series",
            name: "Korean Series",
            extra: [
                { name: "genre", options: Object.keys(GENRE_MAP.series), isRequired: false },
                { name: "skip", isRequired: false }
            ]
        }
    ],
    resources: ["catalog"],
    idPrefixes: ["tmdb"]
};

const builder = new addonBuilder(manifest);

async function fetchTMDBCatalog(type, genreName, skip) {
    const genreId = GENRE_MAP[type][genreName] || null;
    const tmdbType = type === "movie" ? "movie" : "tv";
    const page = Math.floor((skip || 0) / 20) + 1;
    let url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_API_KEY}&with_original_language=ko&sort_by=popularity.desc&page=${page}`;
    if (genreId) url += `&with_genres=${genreId}`;

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
        const metas = await fetchTMDBCatalog(type, extra.genre, parseInt(extra.skip || 0));
        return { metas };
    }
    return { metas: [] };
});

const app = express();
app.use("/", getRouter(builder.getInterface()));
app.listen(process.env.PORT || 7000);
