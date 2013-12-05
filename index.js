var fs = require('fs');

var _ = require('lodash');
var async = require('async');
var moment = require('moment');
var builder = require('mongo-sql');
var DB = require('./db');

/**
 * Express middleware to save requests w/database table partitioning
 * @param  {Object} options
 *         - {String} connStr: postgres connection string
 *         - {String} table: table name
 *         - {String} plan (optional): year, month, week, day (default: month)
 *         - {Object} customFields (optional) get values from req object (use array for nested properites)
 *           - {'uuid': 'uuid'}
 *           - {'uuid': ['body', 'uuid']}
 */
module.exports = function (options) {
  // handle required option parameters
  if (!options.connStr) throw Error('connStr is required!');
  if (!options.table) throw Error('table is required!');

  var defaults = {
    plan: 'month'
  };

  var definition = {
    id: {
      type: 'serial'
    , primaryKey: true
    }
  , method: {
      type: 'text'
    }
  , url: {
      type: 'text'
    }
  , query: {
      type: 'json'
    }
  , userAgent: {
      type: 'text'
    }
  , data: {
      type: 'json'
    }
  , createdAt: {
      type: 'timestamptz'
    , default: 'now()'
    }
  };

  // override any defaults
  options.plan = options.plan || defaults.plan;

  var db = DB(options.connStr);

  db.getClient(function (error, client, done) {
    var tasks = [
      // get automated partitioning function from disk
      function (callback) {
        fs.readFile(__dirname+'/sql/partition-function.sql.tmpl', function(error, template) {
          if (error) console.error("could not load partitioning function sql from disk");

          // replace values in template
          var sql = template.toString()
            .replace(/\{\{PARENT_TABLE_NAME\}\}/g, options.table)
            .replace(/\{\{PLAN\}\}/g, options.plan)
          ;
          callback(error, sql);
        });
      }
      // create advisory lock
    , function (sql, callback) {
        client.query('SELECT pg_advisory_lock(1);', function(error) {
          if (error) console.error("could not get advisory lock");
          callback(error, sql);
        });
      }
      // load partitioning function into database
    , function (sql, callback) {
        client.query(sql, function(error) {
          if (error) console.error("could not loading partitioning function");
          callback(error);
        });
      }
      // create table if it doesn't exist
    , function (callback) {
        var sql = builder.sql({
          type: 'create-table'
        , table: options.table
        , ifNotExists: true
        , definition: definition
        });

        client.query(sql.query, sql.values, function(error) {
          if (error) console.error('could not create table');
          callback(error);
        });
      }
      // update partitions
    , function (callback) {
        // assumes public schema
        var sql = "SELECT create_insert_http_requests_trigger('"+options.table+"');";

        client.query(sql, function(error) {
          if (error) console.error('could not update partition');
          callback(error);
        });
      }
      // remove advisory lock
    , function (callback) {
        client.query('SELECT pg_advisory_unlock(1);', function(error) {
          if (error) console.error('could let go of advisory lock');
          callback(error);
        });
      }
    ];

    async.waterfall(tasks, function(error) {
      done();
      if (error) throw error;
    });
  });

  // express middleware
  return function (req, res, next) {
    var headers = {};
    for (var k in req.headers)
      headers[k.toLowerCase()] = req.headers[k];

    var values = {
      method: req.method
    , url: req.url
    , query: req.query
    , userAgent:headers['user-agent']
    }

    if (options.customFields) {
      values.data = {};
      _.each(options.customFields, function(value, key) {
        if (Array.isArray(value)) {
          value.data[key] = _.reduce(value, function(current, x) {return (current||0)[x];}, req);
        } else {
          values.data[key] = req[value];
        }
      });
    }

    var sql = builder.sql({
      type: 'insert'
    , table: options.table
    , values: values
    });

    db.query(sql.query, sql.values, function(error) {
      if (error) return console.error('could not save request data', error);
    });

    next();
  };
};
