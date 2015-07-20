/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('../lib/hprose.js');
var TimeoutError = require('../lib/common/TimeoutError.js');

(function() {
    var completer = new hprose.Completer();
    var future = completer.future;
    future.then(function(result) {
        return result + 1;
    }).then(function(result) {
        return result + 1;
    }).then(function(result) {
        console.log(result);
    });
    future.then(function(result) {
        console.log(result);
    });
    completer.complete(1);
})();

(function() {
    var completer = new hprose.Completer();
    var future = completer.future;
    future.then(null, function(result) {
        return result + 1;
    }).then(function(result) {
        return result + 1;
    }).then(function(result) {
        console.log(result);
    });
    future.then(null, function(result) {
        console.log(result);
    });
    completer.completeError(1);
})();

(function() {
    var Future = hprose.Future;
    var p1 = Future.delayed(500, function() { return "one"; });
    var p2 = Future.delayed(100, function() { return "two"; });
    Future.race([p1, p2]).then(function(value) {
        console.log(value);
    });
    Future.race([Future.resolve("p1"), "p2"]).then(function(value) {
        console.log(value);
    });
})();

(function() {
    var Future = hprose.Future;
    var p1 = Future.delayed(500, function() { return "one"; });
    var p2 = Future.delayed(100, function() { return "two"; });
    Future.any([p1, p2]).then(function(value) {
        console.log(value);
    });
    Future.any([Future.resolve("p1"), "p2"]).then(function(value) {
        console.log(value);
    });
    Future.any([Future.error(1), Future.error(2)]).then(null, function(value) {
        console.log(value);
    });
    Future.any([]).then(null, function(value) {
        console.log(value);
    });
})();

(function() {
    var Future = hprose.Future;
    var promise = Future.resolve(3);
    Future.all([true, promise]).then(function(values) {
       console.log(values); // [true, 3]
    });
})();

(function() {
    var Future = hprose.Future;
    var promise = Future.resolve(3);
    Future.join(true, promise).then(function(values) {
       console.log(values); // [true, 3]
    });
})();

(function() {
    var Future = hprose.Future;
    var promise = Future.resolve(3);
    Future.settle([true, promise, Future.error('e')]).then(function(values) {
       console.log(values); // [true, 3]
    });
})();

(function() {
    var Future = hprose.Future;
    var promise = Future.resolve(3);
    console.log(promise.inspect()); // Object {state: "fulfilled", value: 3}
})();

(function() {
    var Future = hprose.Future;
    var promise = Future.resolve(3);
    Future.forEach([true, promise], function(value) {
       console.log(value);
    });
     // true
     // 3
})();

(function() {
    var Future = hprose.Future;
    var promise = Future.resolve(3);
    Future.resolve([true, promise]).forEach(function(value) {
       console.log(value);
    });
     // true
     // 3
})();

(function() {
    var Future = hprose.Future;
    var promise = Future.resolve(3);
    Future.resolve([true, promise]).forEach(function(value) {
       console.log(value);
    });
     // true
     // 3
})();

(function() {
    var Future = hprose.Future;
    function add(a, b) { return a + b; }
    var a = Future.resolve(3);
    var b = Future.resolve(5);
    Future.run(console.log, console, Future.run(add, null, a, b)); // 8
})();

(function() {
    var Future = hprose.Future;
    Future.delayed(500, function() { return "one"; })
          .timeout(300)
          .then(function(value) {
              console.log(value);
          })
          .catchError(function(reason) {
              console.error(reason);
          }, function(e) {
              return e instanceof TimeoutError;
          });
})();

(function() {
    var Future = hprose.Future;
    var delayedDate = Future.delayed(1000, function() { return new Date(); });
    var log = Future.wrap(console.log, console);
    log(delayedDate);
    delayedDate.bind(Object.getOwnPropertyNames(Date.prototype));
    log(delayedDate.getTime());
    log(delayedDate.call('toLocaleString'));
    log(delayedDate.apply('toTimeString'));
    delayedDate.set('year', delayedDate.getFullYear());
    log(delayedDate.get('year'));
})();

(function() {
    var Promise = global.Promise;
    var promiseCount = 0;

    function testPromise() {
        var thisPromiseCount = ++promiseCount;

        console.log(thisPromiseCount +
            ') Started (Sync code started)');

        // We make a new promise: we promise the string 'result' (after waiting 3s)
        var p1 = new Promise(
            // The resolver function is called with the ability to resolve or
            // reject the promise
            function(resolve, reject) {
                console.log(thisPromiseCount +
                    ') Promise started (Async code started)');
                // This only is an example to create asynchronism
                global.setTimeout(
                    function() {
                        // We fulfill the promise !
                        resolve(thisPromiseCount);
                    }, Math.random() * 2000 + 1000);
            });

        // We define what to do when the promise is fulfilled
        //but we only call this if the promise is resolved/fulfilled
        p1.then(
            // Just log the message and a value
            function(val) {
                console.log(val +
                    ') Promise fulfilled (Async code terminated)');
            }).catch(function() { console.log('promise was rejected');});

        console.log(thisPromiseCount +
            ') Promise made (Sync code terminated)');
    }

    testPromise();
    testPromise();
    testPromise();
    testPromise();
})();
