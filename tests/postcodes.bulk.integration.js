var path = require("path"),
		app = require(path.join(__dirname, "../server")),
		request = require("supertest"),
		assert = require("chai").assert,
		helper = require(__dirname + "/helper")
		async = require("async");

describe("Postcodes routes", function () {
	var testPostcode;

	before(function (done) {
		this.timeout(0);
		helper.connectToDb();
		helper.clearPostcodeDb(function (error, result) {
			if (error) return done(error);
			helper.seedPostcodeDb(function (error, result) {
				if (error) return done(error);
				done();
			});
		});
	});

	beforeEach(function (done) {
		helper.lookupRandomPostcode(function (result) {
			testPostcode = result.postcode;
			testOutcode = result.outcode;
			done();	
		});
	});

	after(function (done) {
		helper.clearPostcodeDb(done);
	});

	describe("POST /postcodes", function () {
		var bulkLength = 10,
				testPostcodes, testLocations;

		describe("Bulk geocoding", function () {
			beforeEach(function (done) {
				async.times(bulkLength, function (n, next) {
					helper.randomLocation(next);
				}, function (error, locations) {
					if (error) throw error;
					testLocations = locations;
					done();
				});				
			});

			it ("should return postcodes for specified geolocations", function (done) {
				request(app)
				.post("/postcodes")
				.send({geolocations: testLocations})
				.expect("Content-Type", /json/)
				.expect(helper.allowsCORS)
				.expect(200)
				.end(function (error, response) {
					if (error) throw error;
					assert.isArray(response.body.result);
					assert.equal(response.body.result.length, bulkLength);
					response.body.result.forEach(function (lookup) {
						assert.property(lookup, "query");
						assert.property(lookup, "result");
						assert.isArray(lookup.result);
						lookup.result.forEach(function (result) {
							helper.isPostcodeObject(result);
						});
					});
					done();
				});
			});
			it ("should return null if no nearby postcode", function (done) {
				request(app)
				.post("/postcodes")
				.send({geolocations: [{
					longitude: 0,
					latitude: 0
				}]})
				.expect("Content-Type", /json/)
				.expect(helper.allowsCORS)
				.expect(200)
				.end(function (error, response) {
					if (error) throw error;
					assert.equal(response.body.result.length, 1);
					assert.isNull(response.body.result[0].result);
					done();
				});
			});
			it ("should refuse request if lookups number over 100", function (done) {
				testLocations = [];
				for (var i = 0; i < 101; i++) {
					testLocations.push("bogus")
				}
				request(app)
				.post("/postcodes")
				.send({geolocations: testLocations})
				.expect("Content-Type", /json/)
				.expect(helper.allowsCORS)
				.expect(400)
				.end(function (error, response) {
					if (error) throw error;
					assert.match(response.body.error, /too many locations submitted/i);
					done();
				});
			});
			it ("should return 404 if invalid geolocations object", function (done) {
				request(app)
				.post("/postcodes")
				.send({geolocations: "Bogus"})
				.expect("Content-Type", /json/)
				.expect(helper.allowsCORS)
				.expect(400)
				.end(function (error, response) {
					if (error) throw error;
					assert.match(response.body.error, /Invalid data submitted/i);
					done();
				});
			});
			it ("should be sensitive to limit", function (done) {
				var testLocation = testLocations[0];
				testLocation.limit = 1;
				request(app)
				.post("/postcodes")
				.send({geolocations: [testLocation]})
				.expect("Content-Type", /json/)
				.expect(helper.allowsCORS)
				.expect(200)
				.end(function (error, response) {
					if (error) throw error;
					assert.equal(response.body.result.length, 1);
					assert.equal(response.body.result[0].result.length, 1);
					helper.isPostcodeObject(response.body.result[0].result[0]);
					done();
				});
			});
		});

		describe("Bulk postcode lookup", function () {
			beforeEach(function (done) {
				async.times(bulkLength, function (n, next) {
					helper.randomPostcode(next);
				}, function (error, postcodes) {
					if (error) throw error;
					testPostcodes = postcodes;
					done();
				});				
			});

			it ("should return addresses for postcodes", function (done) {
				request(app)
				.post("/postcodes")
				.send({postcodes: testPostcodes})
				.expect('Content-Type', /json/)
				.expect(200)
				.end(function (error, response) {
					if (error) throw error;
					assert.isArray(response.body.result);
					assert.equal(response.body.result.length, bulkLength);
					response.body.result.forEach(function (lookup) {
						assert.property(lookup, "query");
						assert.property(lookup, "result");
						helper.isPostcodeObject(lookup.result);
					});
					done();
				});
			});
			it ("should return an empty result for non string queries", function (done) {
				request(app)
				.post("/postcodes")
				.send({postcodes: [null]})
				.expect('Content-Type', /json/)
				.expect(200)
				.end(function (error, response) {
					if (error) throw error;
					assert.isArray(response.body.result);
					assert.equal(response.body.result.length, 1);
					assert.isNull(response.body.result[0].query);
					assert.isNull(response.body.result[0].result);
					done();
				});
			});
			it ("should return a null if postcode not found", function (done) {
				testPostcodes.push("B0GUS");
				request(app)
				.post("/postcodes")
				.send({postcodes: testPostcodes})
				.expect('Content-Type', /json/)
				.expect(200)
				.end(function (error, response) {
					if (error) throw error;
					assert.equal(response.body.result.length, bulkLength + 1);
					var hasNull = response.body.result.some(function (lookup) {
						return lookup.result === null;
					});
					assert.isTrue(hasNull);
					done();
				});
			});
			it ("should refuse requests if lookups number over 100", function (done) {
				testPostcodes = [];
				for (var i = 0; i < 101; i++) {
					testPostcodes.push("bogus");
				}
				request(app)
				.post("/postcodes")
				.send(testPostcodes)
				.expect('Content-Type', /json/)
				.expect(400)
				.end(function (error, response) {
					if (error) throw error;
					done();
				});
			});	
		});
		
		it ("should return a 400 error if array not submitted", function (done) {
			request(app)
			.post("/postcodes")
			.send({"wrong" : "dataType"})
			.expect('Content-Type', /json/)
			.expect(400)
			.end(function (error, response) {
				if (error) throw error;
				done();
			});
		});
	});
});