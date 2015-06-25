/**********************************************************\
|                                                          |
|                          hprose                          |
|                                                          |
| Official WebSite: http://www.hprose.com/                 |
|                   http://www.hprose.org/                 |
|                                                          |
\**********************************************************/

/**********************************************************\
 *                                                        *
 * hprose/common/Future.js                                *
 *                                                        *
 * Hprose Future for Node.js.                             *
 *                                                        *
 * LastModified: Jun 25, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var PENDING = 0;
var FULFILLED = 1;
var REJECTED = 2;

var setImmediate = global.setImmediate || function(f) { setTimeout(f, 0); };

function Future(computation) {
    if (typeof computation === "function") {
        var completer = new Completer();
        setImmediate(function() {
            try {
                completer.complete(computation());
            }
            catch(e) {
                completer.completeError(e);
            }
        });
        return completer.future;
    }
}

function delayed(duration, computation) {
    if (computation === undefined) {
        computation = function() { return null; };
    }
    var completer = new Completer();
    global.setTimeout(function() {
        try {
            completer.complete(computation());
        }
        catch(e) {
            completer.completeError(e);
        }
    }, duration);
    return completer.future;
}

function error(e) {
    var completer = new Completer();
    completer.completeError(e);
    return completer.future;
}

function sync(computation) {
    var completer = new Completer(true);
    try {
        completer.complete(computation());
    }
    catch(e) {
        completer.completeError(e);
    }
    return completer.future;
}

function value(v) {
    return sync(function() { return v; });
}

Object.defineProperties(Future, {
    delayed: { value: delayed },
    error: { value: error },
    sync: { value : sync },
    value: { value : value }
});

global.hprose.Future = Future;

function isFuture(obj) {
    return (obj instanceof Future) && (typeof (obj.then === "function"));
}

function Completer(sync) {
    var _status = PENDING;
    var _result;
    var _error;
    var _callbacks = [];
    var _future = new Future();
    var run = sync ?
        function(callback, x) {
            return Future.sync(function() { return callback(x); });
        } :
        function(callback, x) {
            return new Future(function() { return callback(x); });
        };

    function resolve(onComplete, onError, x) {
        if (isFuture(x)) {
            if (x === _future) {
                throw new TypeError('Self resolution');
            }
            return x.then(onComplete, onError);
        }
        if ((typeof x === "object") || (typeof x === "function")) {
            var completer = new Completer();
            var then;
            try {
                then = x.then;
            }
            catch (e) {
                completer.completeError(e);
                return completer.future;
            }
            if (typeof then === "function") {
                try {
                    then.call(x, completer.complete, completer.completeError);
                }
                catch (e) {
                    completer.completeError(e);
                }
                return completer.future;
            }
        }
        if (onComplete) {
            return run(onComplete, x);
        }
        return x;
    }

    // Calling complete must not be done more than once.
    function complete(result) {
        if (_status === PENDING) {
            _status = FULFILLED;
            _result = result;
            while (_callbacks.length > 0) {
                var callback = _callbacks.shift();
                result = resolve(callback[0], callback[1], result);
            }
        }
    }

    // Calling complete must not be done more than once.
    function completeError(error) {
        if (_status === PENDING) {
            _status = REJECTED;
            _error = error;
            var callback;
            var result;
            while (_callbacks.length > 0) {
                callback = _callbacks.shift();
                if (callback[1]) {
                    result = run(callback[1], error);
                    break;
                }
            }
            if (_callbacks.length > 0) {
                do {
                    callback = _callbacks.shift();
                    result = resolve(callback[0], callback[1], result);
                } while (_callbacks.length > 0);
            }
        }
    }

    function then(onComplete, onError) {
        if (typeof onComplete !== "function") onComplete = null;
        if (typeof onError !== "function") onError = null;
        if (onComplete || onError) {
            if (onComplete && (_status === FULFILLED)) {
                 return resolve(onComplete, onError, _result);
            }
            if (onError && (_status === REJECTED)) {
                return run(onError, _error);
            }
            _callbacks.push([onComplete, onError]);
        }
        return _future;
    }

    function catchError(onError) {
        return then(null, onError);
    }

    function whenComplete(action) {
        return then(
            function(v) {
                var f = action();
                if (isFuture(f)) return f.then(function() { return v; });
                return v;
            },
            function(e) {
                var f = action();
                if (isFuture(f)) return f.then(function() { throw e; });
                throw e;
            }
        );
    }

    Object.defineProperties(_future, {
        then: { value: then },
        catchError: { value: catchError },
        whenComplete: { value: whenComplete }
    });

    Object.defineProperties(this, {
        future: { get: function() { return _future; } },
        isCompleted: { get: function() { return (_status !== PENDING); } },
        complete: { value : complete },
        completeError: { value : completeError }
    });
}

Object.defineProperty(Completer, 'isFuture', { value: isFuture });
Object.defineProperty(Completer, 'sync', { value: function() { return new Completer(true); } });

global.hprose.Completer = Completer;
