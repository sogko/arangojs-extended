var util = require('util');
var Utils = require('./../utils');
var extend = util._extend;
var _ = require('lodash');
var async = require('async');
var logger = require('contextual-logger')('[TrackedDocumentAPI]').log;
var ArangoExtended = require('./../ArangoExtended');

logger = function () {}; // comment out to show debug logs

var db;

var generateEntityKey = function (document) {
  return document._key;
};

var generateEntityHandle = function (collection, document) {
  return [collection, '/', document._key || 'null'].join('');
};

/**
 * The api module to do perform operations on documents tracked with revision history
 *
 * @class collection
 * @module arango
 * @submodule trackedDocument
 **/
function TrackedDocumentAPI(_db) {

  db = _db;

  return {

    exists: function (id, callback) {
      if (!id) return callback(new Error('Missing document id'), false, null);

      db.document.get(id, function (err, ret) {
        if (err) return callback(null, false, ret);
        callback(null, (typeof ret !== 'undefined' || ret !== null), ret);
      });

    },

    create: function (collection, documents, options, callback) {
      if (!_.isArray(documents)) documents = [documents];

      if (typeof options === 'function') {
        callback = options;
        options = {};
      }

      var savedArray = [];
      logger('save count: ', documents.length, callback);
      async.forEach(documents,
        function (document, next) {

          document = _.cloneDeep(document);

          var handle = generateEntityHandle(collection, document);

          var afterCheckIfDocumentExists = function (err, exists, existingDocument) {
            if (err) return next(err);

            // check if requires update (any changes to raw_data)
            var diffKeys = _.difference(_.keys(existingDocument), _.keys(document));

            // compare documents while skipping the following keys
            var cloneExistingDocument = _.omit(existingDocument, diffKeys);
            var cloneNewDocument = _.omit(document, diffKeys);
            var requiresUpdate = (!_.isEqual(cloneExistingDocument, cloneNewDocument));
            logger('existingDocument', (existingDocument) ? 'yes' : 'no');
            logger('requiresUpdate', requiresUpdate);
            logger('has crawled before? ', (existingDocument && existingDocument._key) ? 'yes, id: ' + existingDocument._key : 'no');
            logger('requires update? ', (existingDocument && requiresUpdate) ? 'yes' : 'no');

            // make decision whether to create new document, create revision or do nothing
            if (!exists) {

              _saveNewDocument(collection, document, options, function (err, results) {
                if (err) return next(err, null);
                if (!results) return next(new Error('Missing new saved documents results'), null);

                savedArray.push(results);
                next();
              });

            } else if (exists && existingDocument && requiresUpdate) {

              _saveNewDocumentRevision(collection, document, existingDocument, options, function (err, results) {
                if (err) return next(err, null);
                if (!results) return next(new Error('Missing saved revision documents results'), null);

                savedArray.push(results);
                next();
              });

            } else {
              // is an existing document and does not require update
              next();
            }
          }.bind(this);
          this.exists(handle, afterCheckIfDocumentExists);

        }.bind(this),
        function (err, results) {
          logger('create', err, ',', savedArray);
          callback(err, savedArray);
        }
      );
    },

    get: function (id, options, callback) {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      return db.document.get(id, options, callback);
    },

    put: function (id, data, options, callback) {

      if (typeof options === 'function') {
        callback = options;
        options = {};
      }

      var idTokens = id.split('/');
      if (!idTokens || idTokens.length !== 2) return callback(-1, {
        error: true,
        errorNum: 1203,
        code: 404
      });

      var collection = idTokens[0];
      var key = idTokens[1];

      data = _.cloneDeep(data);
      data._key = key;

      async.series([
        function getDocument(next) {
          db.document.get(id, options, function (err, results) {
            next(err, results);
          });
        }.bind(this),
        function createIfExists(next) {
          this.create(collection, data, options, next);
        }.bind(this)
      ], function (err, results) {
        callback(err, results[1] || results[0] || null);
      });
    },

    delete: function (id, options, callback) {

      if (typeof options === 'function') {
        callback = options;
        options = {};
      }

      // TODO: delete edges (but keep history?)
      return db.document.delete(id, options, callback);
    },

    list: function (collection, callback) {
      return db.document.list(collection, callback);
    }

  };
}

function _saveNewDocument(collection, document, options, callback) {

  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  logger('_saveNewDocument');

  var saved = {};

  var collectionNames = Utils.generateTrackedCollectionNames(collection);

  // is a new document, create main document and its history
  document._key = generateEntityKey(document);
  document.created = (document.created) ? document.created : new Date();
  document.modified = (document.modified) ? document.modified : new Date();

  async.series([
    function createMainDocument(next) {
      db.document.create(collectionNames.entity, document, options, function (err, results) {
        if (err) return next(err, results);

        saved.document = results;
        next(null, results);
      });
    },

    function createHistory(next) {
      document.parentDoc = saved.document._key;
      delete document._key; // let arango manage history docs key
      delete document.modified;
      db.document.create(collectionNames.entityHistory, document, options, function (err, results) {
        if (err) return next(err);

        saved.history = results;
        next(null, results);
      });

    },
    function createHeadEdge(next) {
      if (!saved.history) return next(new Error('Missing history document'));
      var from = generateEntityHandle(collection, saved.document);
      var to = saved.history._id;
      var data = { type: 'headRevision' };
      db.edge.create(collectionNames.entityEdges, from, to, data, options, function (err, results) {
        if (err) return next(err);

        saved.headEdge = results;
        next(null, results);
      });
    },
    function createRevisionEdge(next) {
      if (!saved.history) return next(new Error('Missing history document'));
      var from = generateEntityHandle(collection, saved.document);
      var to = saved.history._id;
      var data = { type: 'revision' };
      db.edge.create(collectionNames.entityEdges, from, to, data,  options, function (err, results) {
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

function _saveNewDocumentRevision(collection, document, existingDocument, options, callback) {

  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  logger('_saveNewDocumentRevision');

  var collectionNames = Utils.generateTrackedCollectionNames(collection);
  var currentHistoryHead;
  var handle = generateEntityHandle(collection, document);
  var saved = {};

  async.series([
    function getCurrentHistoryHead(next) {
      var query = db.query.for('e').in(collectionNames.entityEdges)
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

      db.document.put(handle, document, options, function(err, results) {
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

      db.document.create(collectionNames.entityHistory, document, options, function (err, results) {
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
      db.edge.create(collectionNames.entityEdges, from, to, data, options, function (err, results) {
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
      db.edge.create(collectionNames.entityEdges, from, to, data,  options, function (err, results) {
        logger('pointMainDocumentToNewHead', from, to);
        if (err) return next(err);

        saved.headEdge = results;
        next(null, results);
      });
    },
    function deleteOldHistoryHeadEdge(next) {
      if (!currentHistoryHead) return next(new Error('Missing history head document'));
      db.edge.delete(currentHistoryHead._id, options, function (err, results) {
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
      db.edge.create(collectionNames.entityEdges, from, to, data,  options, function (err, results) {
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

module.exports = ArangoExtended.api('trackedDocument', TrackedDocumentAPI);