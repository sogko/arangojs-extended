var _ = require('lodash');
var should = require('should');
var async = require('async');
var ArangoExtended = require('../../../../index');
var config = require('./../../../config');
var DatabaseSupport = require('../../../support/database');

var db = DatabaseSupport.connect();
var collection_name = 'testCollection';

describe('db.trackedDocument', function () {

  before(function(done) {
    DatabaseSupport.useTestDatabase(db, done);
  });

  beforeEach(function(done) {
    async.series([
      function (next) {
        DatabaseSupport.truncateDatabase(db, next);
      },
      function (next) {
        db.trackedCollection.create(collection_name, next);
      }
    ], function () {
      done();
    });
  });

  it('should exposed expected members/methods', function (done) {
    db.trackedDocument.should.have.properties([
      'exists', 'create', 'get',
      'put', 'delete', 'list'
    ]);
    done();
  });

  describe('create(collection, documents, options, cb)', function () {

    it('should save new document to collection and return related documents and edges', function (done) {
      var data = {
        _key: 'uniqueKey-120-313-42343',
        name: 'test data name',
        description: 'test description',
        created: new Date().toISOString() // dates are stored as ISOString in arangodb
      };
      var results;

      async.series([
        function saveNewDocument(next) {
          db.trackedDocument.create(collection_name, data, function(err, res){
            results = res;
            should.not.exists(err);
            should.exists(results);
            results.should.have.length(1);

            assertNewDocumentResultsProperties(results[0]);
            next();
          });
        },
        function _assertDocumentKeys(next) {
          assertDocumentKeys(results[0], data, next);
        },
        function _assertDocumentContent(next) {
          assertDocumentContent(results[0], data, next);
        }
      ], function (err) {
        done(err);
      });

    });

    it('should save new document to collection and let db manage _key property if not specified', function (done) {
      var data = {
        name: 'test data name',
        description: 'test description',
        created: new Date().toISOString() // dates are stored as ISOString in arangodb
      };
      var results;

      async.series([
        function saveNewDocument(next) {
          db.trackedDocument.create(collection_name, data, function(err, res){
            results = res;
            should.not.exists(err);
            should.exists(results);
            results.should.have.length(1);

            assertNewDocumentResultsProperties(results[0]);
            next();
          });
        },
        function _assertDocumentKeys(next) {
          assertDocumentKeys(results[0], data, next);
        },
        function _assertDocumentContent(next) {
          assertDocumentContent(results[0], data, next);
        }
      ], function (err) {
        done(err);
      });

    });

    it('should update document if document._key already exists and has changes; should return related documents and edges', function (done) {

      var results;

      var data = {
        _key: 'uniqueKey-120-313-42343',
        name: 'test data name',
        description: 'test description'
      };

      var changed_data = {
        _key: 'uniqueKey-120-313-42343',
        description: 'changed description'
      };

      async.series([
        function saveNewDocument(next) {
          db.trackedDocument.create(collection_name, data, function (err, res) {
            results = res;
            should.not.exists(err);
            should.exists(results);
            results.should.have.length(1);

            assertNewDocumentResultsProperties(results[0]);
            next();
          });
        },
        function _assertDocumentKeys(next) {
          assertDocumentKeys(results[0], data, next);
        },
        function _assertDocumentContent(next) {
          assertDocumentContent(results[0], data, next);
        },
        function saveSameDocumentWithChanges(next) {
          db.trackedDocument.create(collection_name, changed_data, function (err, res) {
            results = res;

            should.not.exists(err);
            should.exists(results);
            results.should.have.length(1);

            assertRevisedDocumentResultsProperties(results[0]);
            next();
          });
        },
        function _assertDocumentKeys(next) {
          assertDocumentKeys(results[0], changed_data, next);
        },
        function _assertDocumentContent(next) {
          assertDocumentContent(results[0], changed_data, next);
        }
      ], function (err) {
        done(err);
      });
    });

    it('should not update document if document._key already exists and has no changes; should return zero documents', function (done) {

      var results;

      var data = {
        _key: 'uniqueKey-120-313-42343',
        name: 'test data name',
        description: 'test description'
      };

      var changed_data = {
        _key: 'uniqueKey-120-313-42343',
        description: 'test description'
      };

      async.series([
        function saveNewDocument(next) {
          db.trackedDocument.create(collection_name, data, function (err, res) {
            results = res;
            should.not.exists(err);
            should.exists(results);
            results.should.have.length(1);

            assertNewDocumentResultsProperties(results[0]);
            next();
          });
        },
        function _assertDocumentKeys(next) {
          assertDocumentKeys(results[0], data, next);
        },
        function _assertDocumentContent(next) {
          assertDocumentContent(results[0], data, next);
        },
        function saveSameDocumentWithNoChanges(next) {
          db.trackedDocument.create(collection_name, changed_data, function (err, res) {
            results = res;
            should.not.exists(err);
            should.exists(results);
            results.should.have.length(0);
            next();
          });
        }
      ], function (err) {
        done(err);
      });
    });
  });

  describe('exists(id, cb)', function () {

    it('should return true if found a document for the given id', function (done) {

      var data = {
        name: 'test document'
      };
      var id;

      async.series([
        function createDocument(next) {
          db.trackedDocument.create(collection_name, data, { waitForSync: true }, function (err, results) {
            id = results[0].document._id;
            next(err);
          });
        },
        function checkIfDocumentExists(next) {
          db.trackedDocument.exists(id, function (err, exists, document) {
            should.not.exists(err);
            exists.should.equal(true);
            should.exists(document);
            document._id.should.equal(id);
            next();

          });
        }
      ], function (err, results) {
        done(err);
      });
    });

    it('should return false if no document found for the given handle', function (done) {

      async.series([
        function checkIfDocumentExists(next) {
          db.trackedDocument.exists('testCollection/nonexistinghandle', function (err, exists, results) {
            should.not.exists(err);
            exists.should.equal(false);
            should.exists(results);
            results.should.have.property('error', true);
            results.should.have.property('errorNum', 1202);
            results.should.have.property('code', 404);
            next();
          });
        }
      ], function (err, results) {
        done(err);
      });
    });

    it('should return error if no handle given', function (done) {

      async.series([
        function checkIfDocumentExists(next) {
          db.trackedDocument.exists(undefined, function (err, exists, document) {
            should.exists(err);
            exists.should.equal(false);
            should.not.exists(document);
            next();
          });
        }
      ], function (err, results) {
        done(err);
      });
    });
  });

  describe('get(id, options, cb)', function () {
    it('should be able to get existing document', function (done) {

      var id;
      var data = {
        name: 'test document'
      };

      async.series([
        function createDocument(next) {
          db.trackedDocument.create(collection_name, data, { waitForSync: true }, function (err, results) {
            id = results[0].document._id;
            next(err);
          });
        },
        function getDocument(next) {
          db.trackedDocument.get(id, function (err, document) {
            should.not.exists(err);
            should.exists(document);
            document.should.have.property('_id', id);
            document.should.have.property('name', data.name);
            document.should.have.property('created');
            document.should.have.property('modified');
            next();

          });
        }
      ], function (err, results) {
        done(err);
      });
    });

    it('should not be able to get non-existing document from existing collection', function (done) {
      async.series([
        function getDocument(next) {
          db.trackedDocument.get(collection_name+'/nonexistinghandle', function (err, results) {
            should.exists(err);
            should.exists(results);
            results.should.have.property('error', true);
            results.should.have.property('errorNum', 1202);
            results.should.have.property('code', 404);
            next();

          });
        }
      ], function (err, results) {
        done(err);
      });
    });

    it('should not be able to get non-existing document from non-existing collection', function (done) {
      async.series([
        function getDocument(next) {
          db.trackedDocument.get('nonexistingcollection/nonexistinghandle', function (err, results) {
            should.exists(err);
            should.exists(results);
            results.should.have.property('error', true);
            results.should.have.property('errorNum', 1203);
            results.should.have.property('code', 404);
            next();

          });
        }
      ], function (err, results) {
        done(err);
      });

    });
  });

  describe('delete(id, options, cb)', function () {

    it('should be able to delete existing document', function (done) {
      var id;
      var data = {
        name: 'test document'
      };

      async.series([
        function createDocument(next) {
          db.trackedDocument.create(collection_name, data, { waitForSync: true }, function (err, results) {
            id = results[0].document._id;
            next(err);
          });
        },
        function deleteDocument(next) {
          db.trackedDocument.delete(id, function (err, document) {
            should.not.exists(err);
            should.exists(document);
            document.should.have.property('error', false);
            document.should.have.property('_id', id);
            next();

          });
        }
      ], function (err, results) {
        done(err);
      });
    });

    it('should be able to delete non-existing document from existing collection', function (done) {
      async.series([
        function deleteDocument(next) {
          db.trackedDocument.delete(collection_name+'/nonexistinghandle', function (err, results) {
            should.exists(err);
            should.exists(results);
            results.should.have.property('error', true);
            results.should.have.property('errorNum', 1202);
            results.should.have.property('code', 404);
            next();

          });
        }
      ], function (err) {
        done(err);
      });
    });


    it('should be able to delete non-existing document from non-existing collection', function (done) {
      async.series([
        function deleteDocument(next) {
          db.trackedDocument.delete('nonexistingcollection/nonexistinghandle', function (err, results) {
            should.exists(err);
            should.exists(results);
            results.should.have.property('error', true);
            results.should.have.property('errorNum', 1203);
            results.should.have.property('code', 404);
            next();

          });
        }
      ], function (err) {
        done(err);
      });
    });
  });

  describe('list(collection, cb)', function () {
    it('should be able to list a collection with no documents', function (done) {
      async.series([
        function listDocuments(next) {
          db.trackedDocument.list(collection_name, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.property('documents');
            results.documents.should.have.length(0);
            next();

          });
        }
      ], function (err) {
        done(err);
      });
    });

    it('should be able to list a collection with documents', function (done) {
      var id;
      var data = {
        _key: 'testKey123',
        name: 'test document'
      };

      async.series([
        function createDocument(next) {
          db.trackedDocument.create(collection_name, data, { waitForSync: true }, function (err, results) {
            id = results[0].document._id;
            next(err);
          });
        },
        function listDocuments(next) {
          db.trackedDocument.list(collection_name, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.property('documents');
            results.documents.should.have.length(1);
            results.documents[0].should.equal('/_api/document/testCollection/testKey123');
            next();

          });
        }
      ], function (err) {
        done(err);
      });
    });

    it('should not be able to list a non-existing collection', function (done) {
      async.series([
        function listDocuments(next) {
          db.trackedDocument.list('nonexistingcollection', function (err, results) {
            should.exists(err);
            should.exists(results);
            results.should.have.property('error', true);
            results.should.have.property('errorNum', 1203);
            results.should.have.property('code', 404);
            next();

          });
        }
      ], function (err) {
        done(err);
      });
    });
  });

  describe('put(id, data, option, cb)', function () {

    it('should return error if document does not exists', function (done) {
      var data = { name: 'test data' };
      db.trackedDocument.put(collection_name+'/121212', data, function (err, results) {
        should.exists(err);
        should.exists(results);
        results.should.have.property('error', true);
        results.should.have.property('errorNum', 1202);
        results.should.have.property('code', 404);
        done();
      })
    });

    it('should update if document exists and has changes', function (done) {
      var data = {
        name: 'test data name',
        description: 'test description'
      };

      var changed_data = {
        description: 'changed description'
      };

      var results;
      var document_id;

      async.series([
        function saveNewDocument(next) {
          db.trackedDocument.create(collection_name, data, function(err, res){

            results = res;
            should.not.exists(err);
            should.exists(results);
            results.should.have.length(1);
            assertNewDocumentResultsProperties(results[0]);

            document_id = results[0].document._id;
            next();
          });
        },
        function _assertDocumentKeys(next) {
          assertDocumentKeys(results[0], data, next);
        },
        function _assertDocumentContent(next) {
          assertDocumentContent(results[0], data, next);
        },
        function putData(next) {
          db.trackedDocument.put(document_id, changed_data, function (err, res) {
            results = res;

            should.not.exists(err);
            should.exists(results);
            results.should.have.length(1);
            assertNewDocumentResultsProperties(results[0]);
            next();
          });
        },
        function _assertDocumentKeys(next) {
          assertDocumentKeys(results[0], changed_data, next);
        },
        function _assertDocumentContent(next) {
          assertDocumentContent(results[0], changed_data, next);
        }

      ], function (err) {
        done(err);
      });

    });

    it('should not update if document exists and has no changes; return document and no errors', function (done) {
      var data = {
        name: 'test data name',
        description: 'test description'
      };

      var changed_data = {
        description: 'test description'
      };

      var results;
      var document_id;

      async.series([
        function saveNewDocument(next) {
          db.trackedDocument.create(collection_name, data, function(err, res){

            results = res;
            should.not.exists(err);
            should.exists(results);
            results.should.have.length(1);
            assertNewDocumentResultsProperties(results[0]);

            document_id = results[0].document._id;
            next();
          });
        },
        function _assertDocumentKeys(next) {
          assertDocumentKeys(results[0], data, next);
        },
        function _assertDocumentContent(next) {
          assertDocumentContent(results[0], data, next);
        },
        function putData(next) {
          db.trackedDocument.put(document_id, changed_data, function (err, res) {
            should.not.exists(err);
            should.exists(res);
            res.should.have.length(0);
            next();
          });
        }

      ], function (err) {
        done(err);
      });

    });
  });
});


// Test Helpers
function assertNewDocumentResultsProperties(results) {

  results.should.have.property('document');
  results.should.have.property('history');
  results.should.have.property('headEdge');
  results.should.have.property('revisionEdge');

}

function assertRevisedDocumentResultsProperties(results) {

  results.should.have.property('document');
  results.should.have.property('history');
  results.should.have.property('headEdge');
  results.should.have.property('previousRevisionEdge');
  results.should.have.property('revisionEdge');
  results.should.have.property('deletedHeadEdge');

}

function assertDocumentKeys(result, savedData, callback) {

  var document;

  async.series([
    function getDocument(next) {
      db.document.get(result.document._id, function (err, doc) {
        document = doc;
        should.exists(document);
        next(err, doc);
      });
    },
    function assertKeys(next) {

      // assert document to have these keys automatically created if not specified
      var expectedKeyDiffs = ['_id', '_rev'];
      if (!savedData._key) expectedKeyDiffs.push('_key');
      if (!savedData.created) expectedKeyDiffs.push('created');
      if (!savedData.modified) expectedKeyDiffs.push('modified');

      _.difference(_.keys(document), _.keys(savedData)).should.containDeep(expectedKeyDiffs, 'saved document should contain expected key diffs');

      next();
    }
  ], function (err, results){
    callback(err, results);
  });

}

function assertDocumentContent(result, savedData, callback) {

  var document;

  async.series([
    function getDocument(next) {
      db.document.get(result.document._id, function (err, doc) {
        document = doc;
        should.exists(document);
        next(err, doc);
      });
    },
    function assertContents(next) {

      // assert that content that we have specified to be saved are stored as expected
      // for equality assertion, omit out keys that were not specified
      var diffKeys = _.difference(_.keys(document), _.keys(savedData));
      var documentContent = _.omit(document, diffKeys);
      documentContent.should.containDeep(savedData);
      next();
    }
  ], function (err, results){
    callback(err, results);
  });

}