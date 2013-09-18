var pg = require('pg');

/**
 * Make querying a little more friendly
 * @param  {String} connStr postgres connection string
 */
module.exports = function (connStr) {
  return {
    query: function (query, values, callback) {
      if (typeof values == 'function') {
        callback = values;
        values = [];
      }

      pg.connect(connStr, function(error, client, done) {
        if (error) return callback ? callback(error) : null;

        client.query(query, values, function(error, result) {
          done();

          if (error) return callback ? callback(error) : null;

          if (callback) return callback(null, result);
        });
      });
    }
  };
};