var util = require('util');
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

      _collectionNames = {
        entity: collection_name,
        entityHistory: collection_name + '_history',
        entityEdges: collection_name + '_edges'
      };

      var defaultOpts = {
        customKey: generateEntityKey,
        customHandle: generateEntityHandle
      };
      options = extend(defaultOpts, options || {});

      generateEntityKey = options.customKey;
      generateEntityHandle = options.customHandle;

      async.series([

        function createOrOpenEntityCollection(next) {
          db.collection.create(_collectionNames.entity, function (err) {
            if (err && (!err.code === 409 || err.errorNum === 1207)) return next(err);
            logger('Collection', _collectionNames.entity, 'created / already exists');
            next();
          });
        },

        function createOrOpenEntityHistoryCollection(next) {

          db.collection.create(_collectionNames.entityHistory, {}, function (err) {
            if (err && (!err.code === 409 || err.errorNum === 1207)) return next(err);
            logger('Collection', _collectionNames.entityHistory, 'created / already exists');
            next();
          });
        },

        function createOrOpenEntityEdgesCollection(next) {
          db.collection.create(_collectionNames.entityEdges, { type: 3 }, function (err) {
            if (err && (!err.code === 409 || err.errorNum === 1207)) return next(err);
            logger('Collection', _collectionNames.entityEdges, 'created / already exists');
            next();
          });
        },

        function createOrOpenEntityEdgesCollectionIndices(next) {
          db.index.createHashIndex(_collectionNames.entityEdges, ['type'], function (err) {
            if (err) return next(err);
            logger('Index for collection', _collectionNames.entityEdges, ' created / already exists');
            next();
          });
        }
      ], function (err) {
        logger('init', (err) ? err : 'OK');

        callback(err);
      });
    },

    get: function (id, callback) {
       return db.collection.get(id, callback);
    },

    delete: function (id, callback) {
      var collectionNames = {
        entity: id,
        entityHistory: id + '_history',
        entityEdges: id + '_edges'
      };
      async.forEach(_.values(collectionNames), function(name, next){
        db.collection.delete(name, function (err) {
          next(err);
        });
      }, function(err, res){
        callback(null);
      });

    },

    truncate: function (id, callback) {
      var collectionNames = {
        entity: id,
        entityHistory: id + '_history',
        entityEdges: id + '_edges'
      };
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
        callback((results[0]) ? err : null, results[0]);
      });
    },

    count: function (id, callback) {
      return db.collection.count(id, callback);
    }
  };
}

function _saveNewDocument(ctx, document, callback) {

  logger('_saveNewDocument');

  var saved = {};

  // is a new document, create main document and its history
  document._key = generateEntityKey(document);
  document.created = (document.created) ? document.created : new Date();
  document.modified = (document.modified) ? document.modified : new Date();

  async.series([
    function createMainDocument(next) {
      db.document.create(ctx.collectionNames.entity, document, { waitForSync: true }, function (err, results) {
        if (err) return next(err, results);

        saved.document = results;
        next(null, results);
      });
    },

    function createHistory(next) {
      document.parentDoc = saved.document._key;
      delete document._key; // let arango manage history docs key
      delete document.modified;
      db.document.create(ctx.collectionNames.entityHistory, document, { waitForSync: true }, function (err, results) {
        if (err) return next(err);

        saved.history = results;
        next(null, results);
      });

    },
    function createHeadEdge(next) {
      if (!saved.history) return next(new Error('Missing history document'));
      var from = generateEntityHandle(saved.document);
      var to = saved.history._id;
      var data = { type: 'headRevision' };
      db.edge.create(ctx.collectionNames.entityEdges, from, to, data,  { waitForSync: true }, function (err, results) {
        if (err) return next(err);

        saved.headEdge = results;
        next(null, results);
      });
    },
    function createRevisionEdge(next) {
      if (!saved.history) return next(new Error('Missing history document'));
      var from = generateEntityHandle(saved.document);
      var to = saved.history._id;
      var data = { type: 'revision' };
      db.edge.create(ctx.collectionNames.entityEdges, from, to, data,  { waitForSync: true }, function (err, results) {
        if (err) return next(err);

        saved.revisionEdge = results;
        next(null, results);
      });
    }
  ], function (err, results) {
    logger('_saveNewDocument results', (err) ? err : 'OK', results);
    if (err) return callback(err, null);
    callback(null, saved);
  });
}

function _saveNewDocumentRevision(ctx, document, existingDocument, callback) {

  logger('_saveNewDocumentRevision');

  var currentHistoryHead;
  var handle = generateEntityHandle(document);
  var saved = {};

  async.series([
    function getCurrentHistoryHead(next) {
      var query = db.query.for('e').in(ctx.collectionNames.entityEdges)
        .filter('e._from == @from')
        .filter('e.type == @type')
        .limit('0,1')
        .return('e');

      query.exec({
        from: handle,
        type: 'headRevision'
      }, function (err, ret){
        if (err) return next(err, ret);
        if (!ret || !ret.result || ret.result.length === 0 || !ret.result[0]) {
          return next(new Error('Failed to retrieve history head edge'), ret);
        }

        currentHistoryHead = ret.result[0];
        next(null, ret);
      });
    },
    function replaceMainDocument(next) {
      document._key = existingDocument._key;
      document.created = (document.created) ? document.created : existingDocument.created;
      document.modified = (document.created) ? document.created : new Date();

      db.document.put(handle, document, { waitForSync: true }, function(err, results) {
        if (err) return next(err, results);

        saved.document = results;
        next(null, results);
      });

    },
    function createHistory(next) {
      document.parentDoc = existingDocument._key;
      document.created = new Date();
      document.created = (document.created) ? document.created : new Date();
      delete document._key; // let arango manage history docs key
      delete document.modified; // we don't save modified attribute for revisions

      db.document.create(ctx.collectionNames.entityHistory, document, { waitForSync: true }, function (err, results) {
        if (err) return next(err, results);

        saved.history = results;
        next(null, results);
      });
    },
    function pointNewHistoryToHead(next) {
      if (!saved.history) return next(new Error('Missing history document'));
      if (!currentHistoryHead) return next(new Error('Missing history head edge'));
      var from = saved.history._id;
      var to = currentHistoryHead._to;
      var data = { type: 'prevRevision' };
      db.edge.create(ctx.collectionNames.entityEdges, from, to, data,  { waitForSync: true }, function (err, results) {
        if (err) return next(err, results);

        saved.previousRevisionEdge = results;
        next(null, results);
      });
    },
    function pointMainDocumentToNewHead(next) {
      if (!saved.history) return next(new Error('Missing history document'));
      var from = handle;
      var to = saved.history._id;
      var data = { type: 'headRevision' };
      db.edge.create(ctx.collectionNames.entityEdges, from, to, data,  { waitForSync: true }, function (err, results) {
        logger('pointMainDocumentToNewHead', from, to);
        if (err) return next(err);

        saved.headEdge = results;
        next(null, results);
      });
    },
    function deleteOldHistoryHeadEdge(next) {
      if (!currentHistoryHead) return next(new Error('Missing history head document'));
      db.edge.delete(currentHistoryHead._id, { waitForSync: true }, function (err, results) {
        logger('deleteOldHistoryHeadEdge', currentHistoryHead._id);
        if (err) return next(err, results);

        saved.deletedHeadEdge = results;
        next(null, results);
      });
    },
    function createRevisionEdge(next) {
      if (!saved.history) return next(new Error('Missing history document'));
      var from = handle;
      var to = saved.history._id;
      var data = { type: 'revision' };
      db.edge.create(ctx.collectionNames.entityEdges, from, to, data,  { waitForSync: true }, function (err, results) {
        logger('deleteOldHistoryHeadEdge', currentHistoryHead._id);
        if (err) return next(err, results);

        saved.revisionEdge = results;
        next(null, results);
      });
    }
  ], function (err, results) {
    logger('_saveNewDocumentRevision results', (err) ? err : 'OK', results);
    if (err) return callback(err, null);
    callback(null, saved);
  });
}

module.exports = ArangoExtended.api('trackedCollection', TrackedCollectionAPI);