var util = require('util');
var Utils = require('./../utils');
var extend = util._extend;
var _ = require('lodash');
var async = require('async');
var logger = require('contextual-logger')('[TrackedCollectionAPI]').log;
var ArangoExtended = require('./../ArangoExtended');

logger = function () {}; // comment out to show debug logs

var _collectionNames;
var db;

var generateEntityKey = function (document) {
  return document._key;
};

var generateEntityHandle = function (document) {
  return [_collectionNames.entity, '/', document._key].join('');
};


/**
 * The api module to do perform operations on collections tracked with revision history
 *
 * @class collection
 * @module arango
 * @submodule trackedCollection
 **/
function TrackedCollectionAPI(_db) {
  db = _db;

  return {

    collectionNames: (function () {
      return _collectionNames;
    })(),

    create: function (collection_name, options, callback) {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }

      _collectionNames = Utils.generateTrackedCollectionNames(collection_name);

      var defaultOpts = {
        customKey: generateEntityKey,
        customHandle: generateEntityHandle
      };
      options = extend(defaultOpts, options || {});

      generateEntityKey = options.customKey;
      generateEntityHandle = options.customHandle;
      delete options.customKey;
      delete options.customHandle;

      async.series([

        function createOrOpenEntityCollection(next) {
          var opt = _.cloneDeep(options);
          db.collection.create(_collectionNames.entity, opt, function (err, results) {
            if (err && !(results.code === 409  && results.errorNum === 1207)) return next(err, results);
            if (results.code === 409 && results.errorNum === 1207) {
              logger('Collection', _collectionNames.entity, 'already exists');
              return next();
            }
            logger('Collection', _collectionNames.entity, 'created');
            next();
          });
        },
        function createOrOpenEntityHistoryCollection(next) {
          var opt = _.cloneDeep(options);
          db.collection.create(_collectionNames.entityHistory, opt, function (err, results) {
            if (err && !(results.code === 409  && results.errorNum === 1207)) return next(err, results);
            if (results.code === 409 && results.errorNum === 1207) {
              logger('Collection', _collectionNames.entityHistory, 'already exists');
              return next();
            }
            logger('Collection', _collectionNames.entityHistory, 'created');
            next();
          });
        },
        function createOrOpenEntityEdgesCollection(next) {
          var opt = _.cloneDeep(options);
          db.collection.create(_collectionNames.entityEdges, extend({ type: 3 }, opt), function (err, results) {
            if (err && !(results.code === 409  && results.errorNum === 1207)) return next(err, results);
            if (results.code === 409 && results.errorNum === 1207) {
              logger('Collection', _collectionNames.entityEdges, 'already exists');
              return next();
            }
            logger('Collection', _collectionNames.entityEdges, 'created');
            next();
          });
        },
        function createOrOpenEntityEdgesCollectionIndices(next) {
          db.index.createHashIndex(_collectionNames.entityEdges, ['type'], function (err, results) {
            if (err) return next(err, results);
            logger('Index for collection', _collectionNames.entityEdges, ' created', results);
            next();
          });
        },
        function createOrOpenEntityEdgesCollectionIndices(next) {
          db.index.createHashIndex(_collectionNames.entityEdges, ['reverse_created'], function (err, results) {
            if (err) return next(err, results);
            logger('Index for collection', _collectionNames.entityEdges, ' created', results);
            next();
          });
        },
        function createOrOpenRevisionGraph(next) {
          var data = {
            name: _collectionNames.entityRevisionGraph,
            edgeDefinitions: [
              {
                collection: _collectionNames.entityEdges,
                from: [
                  _collectionNames.entity,
                  _collectionNames.entityHistory
                ],
                to: [
                  _collectionNames.entityHistory
                ]
              }
            ]
          };
          db.post('/_api/gharial', data, function (err, results) {
            if (err && !(results.code === 409  && results.errorNum === 1921)) return next(err, results);
            if (results.code === 409 && results.errorNum === 1921) {
              logger('Graph', _collectionNames.entityRevisionGraph, 'already exists');
              return next();
            }
            logger('Graph', _collectionNames.entityRevisionGraph, 'created');
            next();
          });
        }
      ], function (err, results) {
        logger('create', (err) ? results : 'OK');
        callback(err, (!err) ? results[0] : results[results.length - 1]);
      });
    },

    get: function (id, callback) {
       return db.collection.get(id, callback);
    },

    delete: function (id, callback) {
      var collectionNames = Utils.generateTrackedCollectionNames(id);
      async.forEachSeries(_.values(collectionNames), function(name, next){
          if (name === collectionNames.entityRevisionGraph) {
            db.delete('/_api/gharial/' + name, function (err, results) {
              next(err, results);
            });
            return;
          }
          db.collection.delete(name, function (err, results) {
          next(err, results);
        });
      }, function(err, res){
        callback(null);
      });

    },

    truncate: function (id, callback) {
      var collectionNames = Utils.generateTrackedCollectionNames(id);
      async.series([
        function truncateEntityCollection(next) {
          db.collection.truncate(collectionNames.entity, function (err, res) {
            next(err, res);
          });
        },
        function truncateHistoryCollection(next) {
          db.collection.truncate(collectionNames.entityHistory, function (err, res) {
            next(err, res);
          });
        },
        function truncateEdgesCollection(next) {
          db.collection.truncate(collectionNames.entityEdges, function (err, res) {
            next(err, res);
          });
        }
      ], function (err, results) {
        callback(err, (!err) ? results[0] : results[results.length - 1]);
      });
    },

    count: function (id, callback) {
      return db.collection.count(id, callback);
    },

    /**
     * Returns a list of all tracked collections in database
     *
     * @param {Boolean} [excludeSystem=false]  -    if set to true no system collections are returned.
     * @param {Function} callback   - The callback function.
     */
    list: function (excludeSystem, callback) {

      if (typeof excludeSystem === 'function') {
        callback = excludeSystem;
        excludeSystem = false;
      }



      db.collection.list(excludeSystem, function (err, results) {
        if (err) return callback(err, results);

        var candidates = _.keys(results.names);
        var trackedCollections = {
          collections: [],
          names: {}
        };

        _.forEach(candidates, function (name) {
          if (candidates.indexOf(name + '_history') > -1 && candidates.indexOf(name + '_edges') > -1) {
            trackedCollections.collections.push(results.names[name]);
            trackedCollections.names[name] = results.names[name];
          }
        });

        logger('trackedCollections', trackedCollections);

        callback(null, trackedCollections);
      });
    }
  };
}


module.exports = ArangoExtended.api('trackedCollection', TrackedCollectionAPI);