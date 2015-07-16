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
 * LastModified: Jul 17, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var PENDING = 0;
var FULFILLED = 1;
var REJECTED = 2;

var setImmediate = global.setImmediate;

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

function isFuture(obj) {
    return (obj instanceof Future) && (typeof (obj.then === "function"));
}

function isPromise(obj) {
    return isFuture(obj) || ((global.Promise) && (obj instanceof global.Promise) && (typeof (obj.then === "function")));
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
    var completer = new Completer(sync);
    completer.complete(v);
    return completer.future;
}

function promise(executor) {
    var completer = new Completer();
    executor(completer.complete, completer.completeError);
    return completer.future;
}

function arraysize(array) {
    var size = 0;
    Array.prototype.forEach.call(array, function() { ++size; });
    return size;
}

function all(array) {
    if (isPromise(array)) {
        return array.then(all);
    }
    var n = array.length;
    var count = arraysize(array);
    var result = new Array(n);
    var completer = new Completer();
    function check() {
        if (count === 0) {
            completer.complete(result);
        }
    }
    function resolve(i) {
        return function(value) {
            result[i] = value;
            --count;
            check();
        };
    }
    function reject(e) {
        completer.completeError(e);
    }
    Array.prototype.forEach.call(array, function(element, index) {
        var f = (isPromise(element) ? element : value(element));
        f.then(resolve(index), reject);
    });
    return completer.future;
}

function join() {
    return all(arguments);
}

function race(array) {
    if (isPromise(array)) {
        return array.then(race);
    }
    var completer = new Completer();
    Array.prototype.forEach.call(array, function(element) {
        var f = (isPromise(element) ? element : value(element));
        f.then(completer.complete, completer.completeError);
    });
    return completer.future;
}

function any(array) {
    if (isPromise(array)) {
        return array.then(any);
    }
    var n = array.length;
    var count =  arraysize(array);
    var reasons = new Array(n);
    var completer = new Completer();
    function reject(i) {
        return function(e) {
            reasons[i] = e;
            --count;
            if (count === 0) {
                completer.completeError(reasons);
            }
        };
    }
    if (n) {
        Array.prototype.forEach.call(array, function(element, index) {
            var f = (isPromise(element) ? element : value(element));
            f.then(completer.complete, reject(index));
        });
    }
    else {
        completer.completeError(new RangeError('any(): array must not be empty'));
    }
    return completer.future;
}

function settle(array) {
    if (isPromise(array)) {
        return array.then(settle);
    }
    var n = array.length;
    var count = arraysize(array);
    var result = new Array(n);
    var completer = new Completer();
    function check() {
        if (count === 0) {
            completer.complete(result);
        }
    }
    function resolve(i) {
        return function(value) {
            result[i] = { state: 'fulfilled', value: value };
            --count;
            check();
        };
    }
    function reject(i) {
        return function(reason) {
            result[i] = { state: 'rejected', reason: reason };
            --count;
            check();
        };
    }
    Array.prototype.forEach.call(array, function(element, index) {
        var f = (isPromise(element) ? element : value(element));
        f.then(resolve(index), reject(index));
    });
    return completer.future;
}

function exec(handler, thisArg /*, args */) {
    var args = Array.prototype.slice.call(arguments, 2);
    return all(args).then(function(args) {
        return handler.apply(thisArg, args);
    });
}

function wrap(handler, thisArg) {
    return function() {
        return all(arguments).then(function(args) {
            return handler.apply(thisArg, args);
        });
    };
}

function forEach(array, callback, thisArg) {
    return all(array).then(function(array) {
        return array.forEach(callback, thisArg);
    });
}

function every(array, callback, thisArg) {
    return all(array).then(function(array) {
        return array.every(callback, thisArg);
    });
}

function some(array, callback, thisArg) {
    return all(array).then(function(array) {
        return array.some(callback, thisArg);
    });
}

function filter(array, callback, thisArg) {
    return all(array).then(function(array) {
        return array.filter(callback, thisArg);
    });
}

function map(array, callback, thisArg) {
    return all(array).then(function(array) {
        return array.map(callback, thisArg);
    });
}

function reduce(array, callback, initialValue) {
    return all(array).then(function(array) {
        return array.reduce(callback, initialValue);
    });
}

function reduceRight(array, callback, initialValue) {
    return all(array).then(function(array) {
        return array.reduceRight(callback, initialValue);
    });
}

Object.defineProperties(Future, {
    // port from Dart
    delayed: { value: delayed },
    error: { value: error },
    sync: { value : sync },
    value: { value : value },
    // Promise compatible
    all: { value : all },
    race: { value : race },
    resolve: { value : value },
    reject: { value : error },
    // extended methods
    promise: { value: promise },
    isFuture: { value: isFuture },
    isPromise: { value: isPromise },
    join: { value: join },
    any: { value: any },
    settle: { value: settle },
    exec: {value: exec },
    wrap: { value: wrap },
    // for array
    forEach: { value: forEach },
    every: { value: every },
    some: { value: some },
    filter: { value: filter },
    map: { value: map },
    reduce: { value: reduce },
    reduceRight: { value: reduceRight },
});

Object.defineProperties(Future.prototype, {
    catchError: { value: function(onError) {
        return this.then(null, onError);
    } },
    'catch': { value: function(onError) {
        return this.then(null, onError);
    } },
    whenComplete: { value: function(action) {
        return this.then(
            function(v) {
                var f = action();
                if (isPromise(f)) return f.then(function() { return v; });
                return v;
            },
            function(e) {
                var f = action();
                if (isPromise(f)) return f.then(function() { throw e; });
                throw e;
            }
        );
    } },
    delay: { value: function(duration) {
        var completer = new Completer();
        this.then(function(result) {
            global.setTimeout(function() {
                completer.complete(result);
            }, duration);
        },
        completer.completeError);
        return completer.future;
    } },
    tap: { value: function(onFulfilledSideEffect, thisArg) {
        return this.then(function(result) {
            onFulfilledSideEffect.call(thisArg, result);
            return result;
        });
    } },
    spread: { value: function(onFulfilledArray, thisArg) {
        return this.then(function(array) {
            return onFulfilledArray.apply(thisArg, array);
        });
    } },
    forEach: { value: function(callback, thisArg) {
        return forEach(this, callback, thisArg);
    } },
    every: { value: function(callback, thisArg) {
        return every(this, callback, thisArg);
    } },
    some: { value: function(callback, thisArg) {
        return some(this, callback, thisArg);
    } },
    filter: { value: function(callback, thisArg) {
        return filter(this, callback, thisArg);
    } },
    map: { value: function(callback, thisArg) {
        return map(this, callback, thisArg);
    } },
    reduce: { value: function(callback, initialValue) {
        return reduce(this, callback, initialValue);
    } },
    reduceRight: { value: function(callback, initialValue) {
        return reduceRight(this, callback, initialValue);
    } }
});

global.hprose.Future = Future;

function Completer(sync) {
    var _status = PENDING;
    var _result;
    var _error;
    var _tasks = [];
    var _future = new Future();
    var run = sync ?
        function(callback, next, x) {
            try {
                var r = callback(x);
                next.complete(r);
            }
            catch(e) {
                next.completeError(e);
            }
        } :
        function(callback, next, x) {
            setImmediate(function() {
                try {
                    var r = callback(x);
                    next.complete(r);
                }
                catch(e) {
                    next.completeError(e);
                }
            });
        };

    function resolve(resolvePromise, rejectPromise, next, x) {
        if (isPromise(x)) {
            if (x === _future) {
                throw new TypeError('Self resolution');
            }
            x.then(resolvePromise, rejectPromise)
             .then(next.complete, next.completeError);
        }
        else if ((typeof x === "object") || (typeof x === "function")) {
            var then;
            try {
                then = x.then;
            }
            catch (e) {
                if (rejectPromise) {
                    run(rejectPromise, next, e);
                }
                else {
                    next.completeError(e);
                }
                return;
            }
            if (typeof then === "function") {
                try {
                    var f = then.call(x, resolvePromise, rejectPromise);
                    f.then(next.complete, next.completeError);
                }
                catch (e) {
                    next.completeError(e);
                }
            }
            else if (resolvePromise) {
                run(resolvePromise, next, x);
            }
        }
        else if (resolvePromise) {
            run(resolvePromise, next, x);
        }
    }

    // Calling complete must not be done more than once.
    function complete(result) {
        if (_status === PENDING) {
            _status = FULFILLED;
            _result = result;
            while (_tasks.length > 0) {
                var task = _tasks.shift();
                resolve(task.resolvePromise, task.rejectPromise, task.next, result);
            }
        }
    }

    // Calling complete must not be done more than once.
    function completeError(error) {
        if (_status === PENDING) {
            _status = REJECTED;
            _error = error;
            while (_tasks.length > 0) {
                var task = _tasks.shift();
                if (task.rejectPromise) {
                    run(task.rejectPromise, task.next, error);
                }
            }
        }
    }

    function then(onComplete, onError) {
        if (typeof onComplete !== "function") onComplete = null;
        if (typeof onError !== "function") onError = null;
        if (onComplete || onError) {
            var next = new Completer(sync);
            if (onComplete && (_status === FULFILLED)) {
                resolve(onComplete, onError, next, _result);
            }
            else if (onError && (_status === REJECTED)) {
                run(onError, next, _error);
            }
            else {
                _tasks.push({
                    resolvePromise: onComplete,
                    rejectPromise: onError,
                    next: next
                });
            }
            return next.future;
        }
        return _future;
    }

    function inspect() {
        switch (_status) {
            case PENDING: return { state: 'pending' };
            case FULFILLED: return { state: 'fulfilled', value: _result };
            case REJECTED: return { state: 'rejected', reason: _error };
        }
    }

    Object.defineProperties(_future, {
        then: { value: then },
        inspect: { value: inspect }
    });

    Object.defineProperties(this, {
        future: { get: function() { return _future; } },
        isCompleted: { get: function() { return (_status !== PENDING); } },
        complete: { value : complete },
        completeError: { value : completeError }
    });
}

Object.defineProperties(Completer, {
    sync: { value : function() { return new Completer(true); } }
});

global.hprose.Completer = Completer;
