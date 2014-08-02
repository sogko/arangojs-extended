var util = require('util');
var Utils = require('./../utils');
var extend = util._extend;
var _ = require('lodash');
var async = require('async');
var logger = require('contextual-logger')('[RevisionAPI]').log;
var ArangoExtended = require('./../ArangoExtended');

//logger = function () {}; // comment out to show debug logs

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
function RevisionAPI(_db) {

  db = _db;

  return {

    /**
     * Returns a list of revisions keys for a document
     * @param {String} document_id - The document handle
     * @param {Object} [options]
     * @param {Object} [options.skip]
     * @param {Object} [options.limit]
     * @param {Function} callback - The callback function
     */
    list: function (document_id, options, callback) {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }

      var default_options = {
        skip: 0,
        limit: null
      };

      options = extend(options, default_options);

      var collection_name = (document_id) ? document_id.split('/')[0] : '';
      var collectionNames = Utils.generateTrackedCollectionNames(collection_name);

      async.series([
        function getDocument(next) {
          db.document.get(document_id, function (err, results) {
            next(err, results);
          });
        },
        function getRevisions(next) {
          var query = [
            'FOR e in GRAPH_EDGES(',
            '   @graphName,',
            '   { _id: @vertexId },',
            '   { edgeExamples: [{ type: @type }, { _from: @from }] }',
            ')',
            (options.limit) ? ['LIMIT ', options.skip, ', ', options.limit].join('') : '',
            'SORT e.reverse_created ASC',
            'RETURN e'
          ].join(' ');

          var data = {
            graphName: collectionNames.entityRevisionGraph,
            vertexId: document_id,
            type: 'revision',
            from: document_id
          };

          db.query.exec(query, data, function (err, results) {
            if (err) return next(err, results);
            for (var i in results.result) {
              delete results.result[i]._id;
              delete results.result[i]._rev;
              delete results.result[i]._key;
              delete results.result[i]._to;
              delete results.result[i]._from;
              delete results.result[i].reverse_created;
            }
            next(err, results);
          });
        }

      ], function (err, results) {
        callback(err, results[results.length - 1]);
      });
    },

    /**
     * Retrieves a revision state
     *
     * @param document_id
     * @param revision
     * @param options
     * @param callback
     */
    get: function (collection_name, revision, options, callback) {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      var collectionNames = Utils.generateTrackedCollectionNames(collection_name);

      db.document.get([collectionNames.entityHistory, revision].join('/'), options, function (err, results) {
        callback(err, results);
      });
    },
    latest: function (document_id, callback) {
      var collection_name = (document_id) ? document_id.split('/')[0] : '';
      var collectionNames = Utils.generateTrackedCollectionNames(collection_name);

      async.series([
        function getDocument(next) {
          db.document.get(document_id, function (err, results) {
            next(err, results);
          });
        },
        function getHeadRevision(next) {

          var query = [
            'FOR e in GRAPH_EDGES(',
            '   @graphName,',
            '   { _id: @vertexId },',
            '   { edgeExamples: [ { type: @type }, { _from: @from } ] }',
            ')',
            'RETURN e'
          ].join(' ');

          var data = {
            graphName: collectionNames.entityRevisionGraph,
            vertexId: document_id,
            type: 'headRevision',
            from: document_id
          };


          db.query.exec(query, data, function (err, results) {
            if (err) return next(err, results);

            for (var i in results.result) {
              delete results.result[i]._id;
              delete results.result[i]._rev;
              delete results.result[i]._key;
              delete results.result[i]._to;
              delete results.result[i]._from;
              delete results.result[i].reverse_created;
            }
            results = results.result[0];
            next(err, results);
          });
        }

      ], function (err, results) {
        callback(err, results[results.length - 1]);
      });
    },
    next: function (collection_name, revision, callback) {
      var collectionNames = Utils.generateTrackedCollectionNames(collection_name);

      async.series([
        function getDocument(next) {
          db.document.get([collectionNames.entityHistory, revision].join('/'), function (err, results) {
            next(err, results);
          });
        },
        function getNextRevision(next) {
          var query = [
            'FOR e in GRAPH_EDGES(',
            '   @graphName,',
            '   { _key: @revision },',
            '   { direction: @direction,',
            '     edgeExamples: [ { type: @type }, { _to: @to } ],',
            '     startVertexCollectionRestriction: @collectionHistory, ',
            '     endVertexCollectionRestriction: @collectionHistory',
            '   }',
            ')',
            'RETURN e'
          ].join(' ');

          var data = {
            graphName: collectionNames.entityRevisionGraph,
            collectionHistory: collectionNames.entityHistory,
            revision: revision,
            direction: 'inbound',
            type: 'prevRevision',
            to: [collectionNames.entityHistory, revision].join('/')
          };
          db.query.exec(query, data, function (err, results) {
            if (err) return next(-1, { error: true, errorNum: 1202, code: 404, errorMessage: 'Revision not found'});

            results = results.result[0];
            if (!results) return next(-1, { error: true, errorNum: 1202, code: 404, errorMessage: 'Revision not found'});

            results.type = 'nextRevision'; // reverse of prevRevision
            results.rev = results._from.split('/')[1];
            delete results._id;
            delete results._rev;
            delete results._key;
            delete results._to;
            delete results._from;
            delete results.reverse_created;

            next(err, results);
          });
        }
      ], function (err, results) {
        callback(err, results[results.length - 1]);
      });
    },
    previous: function (collection_name, revision, callback) {
      var collectionNames = Utils.generateTrackedCollectionNames(collection_name);

      async.series([
        function getDocument(next) {
          db.document.get([collectionNames.entityHistory, revision].join('/'), function (err, results) {
            next(err, results);
          });
        },
        function getPrevRevision(next) {
          var query = [
            'FOR e in GRAPH_EDGES(',
            '   @graphName,',
            '   { _key: @revision },',
            '   { direction: @direction,',
            '     edgeExamples: [ { type: @type }, { _from: @from } ],',
            '     startVertexCollectionRestriction: @collectionHistory, ',
            '     endVertexCollectionRestriction: @collectionHistory',
            '   }',
            ')',
            'RETURN e'
          ].join(' ');

          var data = {
            graphName: collectionNames.entityRevisionGraph,
            collectionHistory: collectionNames.entityHistory,
            revision: revision,
            direction: 'outbound',
            type: 'prevRevision',
            from: [collectionNames.entityHistory, revision].join('/')
          };
          
          db.query.exec(query, data, function (err, results) {
            if (err) return next(-1, { error: true, errorNum: 1202, code: 404, errorMessage: 'Revision not found'});

            results = results.result[0];
            if (!results) return next(-1, { error: true, errorNum: 1202, code: 404, errorMessage: 'Revision not found'});

            results.rev = results._to.split('/')[1];
            delete results._id;
            delete results._rev;
            delete results._key;
            delete results._to;
            delete results._from;
            delete results.reverse_created;

            next(err, results);
          });
        }
      ], function (err, results) {
        callback(err, results[results.length - 1]);
      });

    }

  };
}

module.exports = ArangoExtended.api('revision', RevisionAPI);