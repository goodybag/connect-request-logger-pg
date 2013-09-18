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
 *         - {Object} definition (optional): additional columns to add to the table
 *         - {String} plan (optional): year, month, week, day (default: month)
 *         - {Object} valueMap (optional): map column name to key on req object to get the values (use array for nested properites)
 *           - 'uuid': 'uuid'
 *           - 'uuid': ['body', 'uuid']
 */
module.exports = function (options) {
  // handle required option parameters
  if (!options.connStr) throw Error('connStr is required!');
  if (!options.table) throw Error('table is required!');
  if (options.definition ? !options.valueMap : options.valueMap) throw Error('must include both definition and valueMap or none of them');

  var defaults = {
    plan: 'month'
  , definition: {
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
    , createdAt: {
        type: 'timestamptz'
      , default: 'now()'
      }
    }
  };

  // override any defaults
  options.plan = options.plan || defaults.plan
  options.definition = _.extend(defaults.definition, options.definition);

  var db = DB(options.connStr);

  var tasks = [
    // get automated partitioning function from disk
    function (callback) {
      fs.readFile(__dirname+'/sql/partition-function.sql.tmpl', function(error, data) {
        if (error) console.error("could not load partitioning function sql from disk");
        callback(error, data.toString().replace("{{PARENT_TABLE_NAME_HERE}}", options.table));
      });
    }
    // load partitioning function into database
  , function (data, callback) {
      db.query(data, function(error) {
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
      , definition: options.definition
      });

      db.query(sql.query, sql.values, function(error) {
        if (error) console.error('could not create table');
        callback(error);
      });
    }
    // update partitions
  , function (callback) {
      // assumes public schema
      var sql = "SELECT create_insert_http_requests_trigger('"+options.table+"');";

      db.query(sql, function(error) {
        if (error) console.error('could not update partition');
        callback(error);
      });
    }
  ];

  async.waterfall(tasks, function(error) {
    if (error) throw error;
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

    if (options.valueMap) {
      _.each(options.valueMap, function(value, key) {
        if (Array.isArray(value)) {
          value[key] = _.reduce(value, function(current, x) {return (current||0)[x];}, req);
        } else {
          values[key] = req[value];
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