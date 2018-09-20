'use strict';

const express = require('express');
const superagent = require('superagent');
const cors = require('cors');
const app = express();
const pg = require('pg');

const client = new pg.Client(process.env.DATABASE_URL);
client.connect();

client.on('error', err => console.error(err));

app.use(cors());
require('dotenv').config();

app.get('/location', getLocation)

app.get('/weather', getWeather);

app.get('/movies', getMovies);

app.get('/yelp', getYelp);

const PORT = process.env.PORT || 3000;

function deleteByLocationId(table, city) {
  const SQL =  `DELETE from ${table} WHERE location_id=${city};`;
  return client.query(SQL);
}

// constructor function for geolocation - called upon inside the request for location
function Location(result, request) {
  this.search_query = request.query.data;
  this.formatted_query = result.body.results[0].formatted_address,
  this.latitude = result.body.results[0].geometry.location.lat,
  this.longitude = result.body.results[0].geometry.location.lng
}

function getLocation(request, response) {
  Location.lookupLocation({
    tableName: Location.tableName,
    query: request.query.data,
    cacheHit: function(result) {
      response.send(result);
    },
    cacheMiss: function () {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${request.query.data}&key=${process.env.GOOGLE_API_KEY}`;
      return superagent.get(url)
        .then(result => {
          const location = new Location(this.query, result);
          location.save()
            .then(location => response.send(location));
        })
        .catch(error => handleError(error));
    }
  })
}

Location.lookupLocation = (location) => {
  const SQL = `SELECT * FROM locations WHERE search_query=$1;`;
  const values = [location.query];

  return client.query(SQL,values)
    .then(result => {
      if (result.rowCount > 0) {
        location.cacheHit(result.rows[0]);
      } else {
        location.cacheMiss();
      }
    })
    .catch(console.error);
}

Location.prototype = {
  save: function() {
    const SQL = `INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id;`;
    const values = [
      this.search_query,
      this.formatted_query,
      this.latitude,
      this.longitude,
    ];
    return client.query(SQL, values)
      .then(result=> {
        this.id = result.rows[0].id;
        return this;
      });
  }
};



//send request to DarkSkys API and gets data back, then calls on Weather function to display data
function getWeather(request, response) {
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;
  return superagent.get(url)

    .then( result => {
      const weatherSummaries = result.body.daily.data.map( day => {
        return new Weather(day);
      })
      response.send(weatherSummaries)
      console.log(weatherSummaries);
    })
    .catch( error => handleError(error, response));
}

function Weather(day) {
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
  this.forecast = day.summary;
}

// Yelp Api request
function getYelp(request, response) {
  const url = `https://api.yelp.com/v3/businesses/search?location=${request.query.data.search_query}`;

  superagent.get(url)
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then(result => {
      const businessSummaries = result.body.businesses.map(data => {
        return new Yelp(data);
      });
      response.send(businessSummaries);
      console.log(businessSummaries);
    })
    .catch( error => handleError(error, response));
}

function Yelp(data) {
  this.name = data.name;
  this.image_url = data.image_url;
  this.price = data.price;
  this.rating = data.rating;
  this.url = data.url;
}

function getMovies(request, response) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIES_API_KEY}&query=${request.query.data.search_query}`;
  return superagent.get(url)

    .then(result => {
      const moviesSummaries = result.body.results.map(movies => {
        return new MoviesData(movies);
      })
      response.send(moviesSummaries);
    })
    .catch( error => handleError(error, response));
}

function MoviesData(movies) {
  this.title = movies.title;
  this.overview = movies.overview;
  this.average_votes = movies.vote_average;
  this.total_votes = movies.vote_count;
  this.image_url = `https://image.tmdb.org/t/p/w200_and_h300_bestv2${movies.poster_path}`;
  this.popularity = movies.popularity;
  this.released_on = movies.release_date;
}

function handleError(err, res) {
  console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
