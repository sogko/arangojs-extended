var url = require('url');
var async = require('async');
var config = require('./../config');
var ArangoExtended = require('../../index');

var DatabaseSupport = {
  connect: function() {
    return ArangoExtended.Connection(config.db.url);
  },
  useTestDatabase: function (db, callback) {
    db.database.create(config.db.url.name, function (err, results) {
      db = db.use(url.resolve(config.db.url, config.db.name));
      callback();
    });
  },
  truncateDatabase: function truncateDatabase(db, callback) {
    async.series([
      function deleteAllCollections(next) {
        db.collection.list(true, function (err, results) {
          async.forEachSeries(results.collections, function (collection, next) {
            db.collection.delete(collection.id, function (err, results) {
              next();
            });
          }, function () {
            next();
          });
        });
      },
      function deleteAllGraphs(next) {
        db.get('/_api/gharial/', function (err, results) {
          async.forEachSeries(results.graphs, function (graph, next) {
            db.delete('/_api/gharial/' + graph._key, function (err, results) {
              next();
            });
          }, function () {
              next();
          });
        });
      }
    ], function() {
      callback();
    });

  }
};

module.exports = DatabaseSupport;