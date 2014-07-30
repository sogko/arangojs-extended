
var _ = require('lodash');
var should = require('should');
var async = require('async');
var ArangoExtended = require('../../../index');

var db = ArangoExtended.Connection('http://localhost:8529/');
var collection_name = 'testCollection';

describe('db.trackedCollection', function () {

  beforeEach(function(done) {
    db.trackedCollection.delete(collection_name, done);
  });

  it('should exposed expected members/methods', function (done) {
    db.trackedCollection.should.have.properties([
      'collectionNames',
      'create', 'get',
      'delete', 'truncate'
    ]);
    done();
  });

  describe('create(collection_name, cb)', function () {

    it('should be able to create database collections if it does not exists', function (done) {
      async.series([
        function collectionDoesNotExists(next) {
          assertDbHaveCollectionsForDocument(false, collection_name, next);
        },
        function createCollection(next) {
          db.trackedCollection.create(collection_name, next);
        },
        function collectionDoesExists(next) {
          assertDbHaveCollectionsForDocument(true, collection_name, next);
        }
      ], function (err) {
        done(err);
      });
    });

    it('should be able to open database collections if already exists', function (done) {
      async.series([
        function createCollection(next) {
          db.trackedCollection.create(collection_name, function(err) {
            should.not.exists(err);
            next(err);
          });
        },
        function collectionDoesExists(next) {
          assertDbHaveCollectionsForDocument(true, collection_name, next);
        },
        function initSecondCollectionWithSameName(next) {
          db.trackedCollection.create(collection_name, function(err) {
            should.not.exists(err);
            next(err);
          });
        },
        function collectionDoesExists(next) {
          assertDbHaveCollectionsForDocument(true, collection_name, next);
        }
      ], function (err) {
        done(err);
      });
    });
  });

  describe('delete(id, cb)', function () {

    it('should be able to delete database collections if it does exists', function (done) {
      async.series([
        function collectionDoesNotExists(next) {
          assertDbHaveCollectionsForDocument(false, collection_name, next);
        },
        function createCollection(next) {
          db.trackedCollection.create(collection_name, next);
        },
        function collectionDoesExists(next) {
          assertDbHaveCollectionsForDocument(true, collection_name, next);
        },
        function deleteCollection(next) {
          db.trackedCollection.delete(collection_name, function(err){
            should.not.exists(err);
            next(err);
          });
        },
        function collectionDoesNotExists(next) {
          assertDbHaveCollectionsForDocument(false, collection_name, next);
        }
      ], function (err) {
        done(err);
      });
    });

    it('should be able to delete non-existing collections', function (done) {
      async.series([
        function collectionDoesNotExists(next) {
          assertDbHaveCollectionsForDocument(false, collection_name, next);
        },
        function deleteCollection(next) {
          db.trackedCollection.delete(collection_name, function(err){
            should.not.exists(err);
            next(err);
          });
        }
      ], function (err) {
        done(err);
      });
    });
  });

  describe('get(id, cb)', function () {
    it('should be able to get existing collection', function (done) {
      async.series([
        function createCollection(next) {
          db.trackedCollection.create(collection_name, next);
        },
        function getCollection(next) {
          db.trackedCollection.get(collection_name, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.property('id');
            results.should.have.property('name', collection_name);
            results.should.have.property('isSystem');
            results.should.have.property('status');
            results.should.have.property('type');
            results.should.have.property('error', false);
            results.should.have.property('code', 200);
            next();
          });
        }
      ], function (err) {
        done(err);
      });
    });

    it('should not be able to get non-existing collection', function (done) {
      async.series([
        function getCollection(next) {
          db.trackedCollection.get(collection_name, function (err, results) {
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

  describe('count(id, cb)', function () {
    it('should not be able to count non-existing collection', function (done) {
      async.series([
        function countCollection(next) {
          db.trackedCollection.count(collection_name, function (err, results) {
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
    it('should be able to count existing collection and return zero if it has no documents', function (done) {
      async.series([
        function createCollection(next) {
          db.trackedCollection.create(collection_name, next);
        },
        function countCollection(next) {
          db.trackedCollection.count(collection_name, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.property('id');
            results.should.have.property('name', collection_name);
            results.should.have.property('count', 0);
            results.should.have.property('error', false);
            results.should.have.property('code', 200);
            next(err);
          });
        }
      ], function (err) {
        done(err);
      });
    });
    it('should be able to count existing collection and return correct count if it has documents (created using non-tracked document API)', function (done) {
      async.series([
        function createCollection(next) {
          db.trackedCollection.create(collection_name, next);
        },
        function createDocument(next) {
          db.document.create(collection_name, { name: 'test' }, next);
        },
        function countCollection(next) {
          db.trackedCollection.count(collection_name, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.property('id');
            results.should.have.property('name', collection_name);
            results.should.have.property('count', 1);
            results.should.have.property('error', false);
            results.should.have.property('code', 200);
            next(err);
          });
        }
      ], function (err) {
        done(err);
      });
    });
  });
  describe('truncate(id, cb)', function () {
    it('should return error if collection does not exists', function (done) {
      async.series([
        function truncateCollection(next) {
          db.trackedCollection.truncate(collection_name, function (err, results) {
            should.exists(err);
            should.exists(results);
            results.should.have.property('error', true);
            results.should.have.property('errorNum', 1203);
            results.should.have.property('code', 404);
            next(err);
          });
        }
      ], function (err) {
        done();
      });
    });

    it('should truncate successfully if collection does exists', function (done) {
      async.series([
        function createCollection(next) {
          db.trackedCollection.create(collection_name, next);
        },
        function createDocument(next) {
          db.document.create(collection_name, { name: 'test' }, next);
        },
        function countCollection(next) {
          db.trackedCollection.count(collection_name, function (err, results) {
            results.should.have.property('count', 1);
            next(err);
          });
        },
        function countCollection(next) {
          db.trackedCollection.truncate(collection_name, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.property('error', false);
            results.should.have.property('code', 200);
            next(err);
          });
        },
        function countCollection(next) {
          db.trackedCollection.count(collection_name, function (err, results) {
            results.should.have.property('count', 0);
            next(err);
          });
        }
      ], function (err) {
        done();
      });
    });
  });
});

// Test Helpers
function assertDbHaveCollectionsForDocument(shouldHave, collection_name, callback) {

  var collectionNames = {
    entity: collection_name,
    entityHistory: collection_name + '_history',
    entityEdges: collection_name + '_edges'
  };

  async.forEach(_.values(collectionNames), function(collection_name, next){
    db.collection.get(collection_name, function (err, results) {
      if (shouldHave === true) {
        should.not.exists(err);
        should.exists(results);
        results.should.have.properties(['error', 'code', 'name']);
        results.error.should.equal(false);
        results.code.should.equal(200);
        results.name.should.equal(collection_name);
      } else {
        should.exists(err);
        should.exists(results);
        results.should.have.properties(['error', 'code', 'errorNum']);
        results.error.should.equal(true);
        results.code.should.equal(404);
        results.errorNum.should.equal(1203);
      }
      next();
    });
  }, function(){
    callback();
  });
}
