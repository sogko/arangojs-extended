var _ = require('lodash');
var should = require('should');
var async = require('async');
var DatabaseSupport = require('../../../support/database');

var db = DatabaseSupport.connect();
var collection_name = 'testCollection';

describe('db.revision', function () {

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
    db.revision.should.have.properties(['list']);
    done();
  });

  describe('list(document_id, opts, cb)', function () {
    it('should return error if document does not exists', function (done) {
      db.revision.list('testCollection/nonExistingDocumentId', function (err, results) {
        should.exists(err);
        should.exists(results);
        results.should.have.property('error', true);
        results.should.have.property('errorNum', 1202);
        results.should.have.property('code', 404);
      });
      done();
    });

    it('should return one revision id for a newly created document', function (done) {
      var document_id;
      var data = {
        name: 'test data'
      };
      async.series([
        function createNewDocument(next) {
          db.trackedDocument.create(collection_name, data, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.length(1);
            document_id = results[0].document._id;
            next();
          });
        },
        function listRevisions(next) {
          db.revision.list(document_id, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.property('result');
            results.should.have.property('error', false);
            results.should.have.property('code', 201);
            results.result.should.have.length(1);

            next();
          });
        }
      ], function (err, results) {
        done(err);
      })
    });

    it('should return correct number of revision ids for an existing document that has been changed multiple times', function (done) {

      var expectedRevisionsCount = 5;
      var document_id;

      // first document
      var data = [{ _key: 'uniqueKey1234', name: 'test data' }];
      for (var i = 0; i < expectedRevisionsCount-1; i++) {
        data.push({ _key: 'uniqueKey1234', name: 'test data change ' + i });
      }

      async.series([
        function createFirstDocument(next) {
          db.trackedDocument.create(collection_name, data, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.length(5);
            document_id = results[0].document._id;
            next();
          });
        },
        function listFirstDocumentRevisions(next) {
          db.revision.list(document_id, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.property('result');
            results.should.have.property('error', false);
            results.should.have.property('code', 201);
            results.result.should.have.length(expectedRevisionsCount);

            next();
          });
        }
      ], function (err, results) {
        done(err);
      })
    });

  });

  describe('get(collection_name, revision, opts, cb)', function () {
    it('should return error if revision does not exists', function (done) {
      db.revision.get(collection_name, 'nonexistingrevision', function (err, results) {
        should.exists(err);
        should.exists(results);
        results.should.have.property('error', true);
        results.should.have.property('errorNum', 1202);
        results.should.have.property('code', 404);
        done();
      });
    });
    it('should be able to get a revision state for a newly created document', function (done) {

      var document_id;
      var revision;

      var data = { _key: 'uniqueKey1234', name: 'test data', description: 'test description' };
      async.series([
        function createFirstDocument(next) {
          db.trackedDocument.create(collection_name, data, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.length(1);
            document_id = results[0].document._id;
            next();
          });
        },
        function listFirstDocumentRevisions(next) {
          db.revision.list(document_id, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.property('result');
            results.should.have.property('error', false);
            results.should.have.property('code', 201);
            results.result.should.have.length(1);

            revision = results.result[0];
            next();
          });
        },
        function getAndCompareRevisionContent(next) {
          db.revision.get(collection_name, revision.rev, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.property('name', data.name);
            results.should.have.property('description', data.description);
            next();
          });
        }
      ], function (err, results) {
        done(err);
      })
    });
    it('should be able to get revision states for a document that has been changed multiple times in the order that it was changed', function (done) {

      var expectedRevisionsCount = 5;
      var document_id;
      var revisions = [];

      var data = [{ _key: 'uniqueKey1234', name: 'test data', description: 'test description' }];
      for (var i = 0; i < expectedRevisionsCount-1; i++) {
        data.push({ _key: 'uniqueKey1234', name: 'test data change ' + i,  description: 'test description ' + i });
      }
      async.series([
        function createFirstDocument(next) {
          db.trackedDocument.create(collection_name, data, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.length(5);
            document_id = results[0].document._id;
            next();
          });
        },
        function listFirstDocumentRevisions(next) {
          db.revision.list(document_id, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.property('result');
            results.should.have.property('error', false);
            results.should.have.property('code', 201);
            results.result.should.have.length(expectedRevisionsCount);

            revisions = results.result;
            next();
          });
        },
        function getAndCompareRevisionContent(next) {
          var i = data.length - 1;
          async.forEachSeries(revisions, function (revision, next) {

            db.revision.get(collection_name, revision.rev, function (err, results) {
              should.not.exists(err);
              should.exists(results);
              results.should.have.property('name', data[i].name);
              results.should.have.property('description', data[i].description);
              i--;
              next();
            });

          }, function (err, results) {
            next(err, results);
          })
        }
      ], function (err, results) {
        done(err);
      })
    });

  });

  describe('latest(document_id, cb)', function () {
    it('should return error if document does not exists', function (done) {
      db.revision.latest('testCollection/nonExistingDocumentId', function (err, results) {
        should.exists(err);
        should.exists(results);
        results.should.have.property('error', true);
        results.should.have.property('errorNum', 1202);
        results.should.have.property('code', 404);
      });
      done();
    });

    it('should return latest revision id for a newly created document', function (done) {
      var revision_key;
      var document_id;
      var data = {
        name: 'test data'
      };
      async.series([
        function createNewDocument(next) {
          db.trackedDocument.create(collection_name, data, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.length(1);
            document_id = results[0].document._id;
            next();
          });
        },
        function getLatestRevision(next) {
          db.revision.latest(document_id, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.property('type', 'headRevision');
            results.should.have.property('rev');
            results.should.have.property('created');
            results.should.have.property('parent', document_id);
            revision_key = results.rev;
            next();
          });
        },
        function checkLatestRevisionContent(next) {
          db.revision.get(collection_name, revision_key, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.property('name', data.name);
            next();
          });
        }
      ], function (err, results) {
        done(err);
      })
    });

    it('should return latest revision id for an existing document that has been changed multiple times', function (done) {

      var revisionsCount = 5;
      var document_id;
      var revision_key;

      var data = [{ _key: 'uniqueKey1234', name: 'test data' }];
      for (var i = 0; i < revisionsCount-1; i++) {
        data.push({ _key: 'uniqueKey1234', name: 'test data change ' + i });
      }

      async.series([
        function createFirstDocument(next) {
          db.trackedDocument.create(collection_name, data, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.length(5);
            document_id = results[0].document._id;
            next();
          });
        },
        function getLatestRevision(next) {
          db.revision.latest(document_id, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.property('type', 'headRevision');
            results.should.have.property('rev');
            results.should.have.property('created');
            results.should.have.property('parent', document_id);
            revision_key = results.rev;

            next();
          });
        },
        function checkLatestRevisionContent(next) {
          db.revision.get(collection_name, revision_key, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.property('name', data[data.length-1].name);
            next();
          });
        }
      ], function (err, results) {
        done(err);
      })
    });

  });

  describe('previous(collection_name, revision, cb)', function () {
    it('should return error if document does not exists', function (done) {
      db.revision.previous(collection_name, 'nonExistingDocumentId', function (err, results) {
        should.exists(err);
        should.exists(results);
        results.should.have.property('error', true);
        results.should.have.property('errorNum', 1202);
        results.should.have.property('code', 404);
      });
      done();
    });

    it('should return error for a revision key that has no previous revision', function (done) {
      var revision_key;
      var document_id;
      var data = {
        name: 'test data'
      };
      async.series([
        function createNewDocument(next) {
          db.trackedDocument.create(collection_name, data, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.length(1);
            document_id = results[0].document._id;
            next();
          });
        },
        function listRevisions(next) {
          db.revision.list(document_id, function (err, results) {
            should.exists(results);
            results.should.have.property('result');
            results.result.should.have.length(1);
            revision_key = results.result[0].rev;
            next();
          });
        },
        function getPrevRevision(next) {
          db.revision.previous(collection_name, revision_key, function (err, results) {
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
      })
    });

    it('should return previous revision key for an existing document that has been changed multiple times', function (done) {

      var revisionsCount = 5;
      var document_id;
      var revisions;

      var data = [{ _key: 'uniqueKey1234', name: 'test data' }];
      for (var i = 0; i < revisionsCount-1; i++) {
        data.push({ _key: 'uniqueKey1234', name: 'test data change ' + i });
      }

      async.series([
        function createFirstDocument(next) {
          db.trackedDocument.create(collection_name, data, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.length(5);
            document_id = results[0].document._id;
            next();
          });
        },
        function listRevisions(next) {
          db.revision.list(document_id, function (err, results) {
            should.exists(results);
            results.should.have.property('result');
            results.result.should.have.length(5);
            revisions = results.result;
            next();
          });
        },
        function navigateRevisionsBackward(next) {
          var revision;
          async.whilst(
            function () { return (revisions.length > 0); },
            function (cb) {
              revision = revisions.shift();
              db.revision.previous(collection_name, revision.rev, function (err, results) {
                if (revisions.length > 0) {
                  // still have more revisions
                  should.not.exists(err);
                  should.exists(results);
                  results.should.have.property('type', 'prevRevision');
                  results.should.have.property('rev', revisions[0].rev);
//                  results.should.have.property('created', revisions[0].created);
                  cb();

                } else {
                  // last revision, should not have prev revisions
                  should.exists(err);
                  should.exists(results);
                  results.should.have.property('error', true);
                  results.should.have.property('errorNum', 1202);
                  results.should.have.property('code', 404);
                  cb();
                }
              });
            },
            function () {
              next();
            }
          );
        }
      ], function (err, results) {
        done(err);
      })
    });

  });

  describe('next(collection_name, revision, cb)', function () {
    it('should return error if document does not exists', function (done) {
      db.revision.next(collection_name, 'nonExistingDocumentId', function (err, results) {
        should.exists(err);
        should.exists(results);
        results.should.have.property('error', true);
        results.should.have.property('errorNum', 1202);
        results.should.have.property('code', 404);
      });
      done();
    });

    it('should return error for a revision key that has no next revision', function (done) {
      var revision_key;
      var document_id;
      var data = {
        name: 'test data'
      };
      async.series([
        function createNewDocument(next) {
          db.trackedDocument.create(collection_name, data, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.length(1);
            document_id = results[0].document._id;
            next();
          });
        },
        function listRevisions(next) {
          db.revision.list(document_id, function (err, results) {
            should.exists(results);
            results.should.have.property('result');
            results.result.should.have.length(1);
            revision_key = results.result[0].rev;
            next();
          });
        },
        function getNextRevision(next) {
          db.revision.next(collection_name, revision_key, function (err, results) {
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
      })
    });

    it('should return next revision key for an existing document that has been changed multiple times', function (done) {

      var revisionsCount = 5;
      var document_id;
      var revisions;

      var data = [{ _key: 'uniqueKey1234', name: 'test data' }];
      for (var i = 0; i < revisionsCount-1; i++) {
        data.push({ _key: 'uniqueKey1234', name: 'test data change ' + i });
      }

      async.series([
        function createFirstDocument(next) {
          db.trackedDocument.create(collection_name, data, function (err, results) {
            should.not.exists(err);
            should.exists(results);
            results.should.have.length(5);
            document_id = results[0].document._id;
            next();
          });
        },
        function listRevisions(next) {
          db.revision.list(document_id, function (err, results) {
            should.exists(results);
            results.should.have.property('result');
            results.result.should.have.length(5);
            revisions = results.result;
            next();
          });
        },
        function navigateRevisionsBackward(next) {
          var revision;
          async.whilst(
            function () { return (revisions.length > 0); },
            function (cb) {
              revision = revisions.pop();
              db.revision.next(collection_name, revision.rev, function (err, results) {
                if (revisions.length > 0) {
                  // still have more revisions

                  should.not.exists(err);
                  should.exists(results);
                  results.should.have.property('type', 'nextRevision');
                  results.should.have.property('rev', revisions[revisions.length-1].rev);
//                  results.should.have.property('created', revisions[revisions.length-1].created);
                  cb();

                } else {
                  // last revision, should not have prev revisions
                  should.exists(err);
                  should.exists(results);
                  results.should.have.property('error', true);
                  results.should.have.property('errorNum', 1202);
                  results.should.have.property('code', 404);
                  cb();
                }
              });
            },
            function () {
              next();
            }
          );
        }
      ], function (err, results) {
        done(err);
      })
    });

  });


});
