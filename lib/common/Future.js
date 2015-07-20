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
 * LastModified: Jul 19, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var TimeoutError = require('./TimeoutError');

var PENDING = 0;
var FULFILLED = 1;
var REJECTED = 2;

var hasPromise = 'Promise' in global;
var setImmediate = global.setImmediate;
var setTimeout = global.setTimeout;
var clearTimeout = global.clearTimeout;
var foreach = Function.prototype.call.bind(Array.prototype.forEach);
var slice = Function.prototype.call.bind(Array.prototype.slice);

function syncCall(callback, next, x) {
    try {
        var r = callback(x);
        next.resolve(r);
    }
    catch(e) {
        next.reject(e);
    }
}

function asyncCall(callback, next, x) {
    setImmediate(function() {
        try {
            var r = callback(x);
            next.resolve(r);
        }
        catch(e) {
            next.reject(e);
        }
    });
}

function Future(computation) {
    var sync = !!computation;
    Object.defineProperties(this, {
        _subscribers: { value: [] },
        _sync: { value: sync },
        _call: { value: sync ? syncCall : asyncCall },
        resolve: { value: this.resolve.bind(this) },
        reject: { value: this.reject.bind(this) },
    });
    var self = this;
    if (typeof computation === 'function') {
        setImmediate(function() {
            try {
                self.resolve(computation());
            }
            catch(e) {
                self.reject(e);
            }
        });
    }
}

function isFuture(obj) {
    return obj instanceof Future;
}

function isPromise(obj) {
    return isFuture(obj) || (hasPromise && (obj instanceof global.Promise) && (typeof (obj.then === 'function')));
}

function delayed(duration, value) {
    var computation = (typeof value === 'function') ?
                      value :
                      function() { return value; };
    var future = new Future();
    setTimeout(function() {
        try {
            future.resolve(computation());
        }
        catch(e) {
            future.reject(e);
        }
    }, duration);
    return future;
}

function error(e) {
    var future = new Future();
    future.reject(e);
    return future;
}

function sync(computation) {
    var future = new Future(true);
    try {
        future.resolve(computation());
    }
    catch(e) {
        future.reject(e);
    }
    return future;
}

function value(v) {
    var future = new Future(true);
    future.resolve(v);
    return future;
}

function promise(executor) {
    var future = new Future();
    executor(future.resolve, future.reject);
    return future;
}

function arraysize(array) {
    var size = 0;
    foreach(array, function() { ++size; });
    return size;
}

function all(array, sync) {
    array = isPromise(array) ? array : value(array);
    return array.then(function(array) {
        var n = array.length;
        var count = arraysize(array);
        var result = new Array(n);
        if (count === 0) return value(result);
        var future = new Future(sync);
        foreach(array, function(element, index) {
            var f = (isPromise(element) ? element : value(element));
            f.then(function(value) {
                result[index] = value;
                if (--count === 0) {
                    future.resolve(result);
                }
            },
            future.reject);
        });
        return future;
    });
}

function join() {
    return all(arguments);
}

function race(array, sync) {
    array = isPromise(array) ? array : value(array);
    return array.then(function(array) {
        var future = new Future(sync);
        foreach(array, function(element) {
            var f = (isPromise(element) ? element : value(element));
            f.then(future.resolve, future.reject);
        });
        return future;
    });
}

function any(array, sync) {
    array = isPromise(array) ? array : value(array);
    return array.then(function(array) {
        var n = array.length;
        var count = arraysize(array);
        if (count === 0) {
            throw new RangeError('any(): array must not be empty');
        }
        var reasons = new Array(n);
        var future = new Future(sync);
        foreach(array, function(element, index) {
            var f = (isPromise(element) ? element : value(element));
            f.then(future.resolve, function(e) {
                reasons[index] = e;
                if (--count === 0) {
                    future.reject(reasons);
                }
            });
        });
        return future;
    });
}

function settle(array, sync) {
    array = isPromise(array) ? array : value(array);
    return array.then(function(array) {
        var n = array.length;
        var count = arraysize(array);
        var result = new Array(n);
        if (count === 0) return value(result);
        var future = new Future(sync);
        foreach(array, function(element, index) {
            var f = (isPromise(element) ? element : value(element));
            f.whenComplete(function() {
                result[index] = f.inspect();
                if (--count === 0) {
                    future.resolve(result);
                }
            });
        });
        return future;
    });
}

function attempt(handler/*, arg1, arg2, ... */) {
    var args = slice(arguments, 1);
    return all(args, true).then(function(args) {
        return handler.apply(undefined, args);
    });
}

function run(handler, thisArg/*, arg1, arg2, ... */) {
    var args = slice(arguments, 2);
    return all(args, true).then(function(args) {
        return handler.apply(thisArg, args);
    });
}

function wrap(handler, thisArg) {
    return function() {
        return all(arguments, true).then(function(args) {
            return handler.apply(thisArg, args);
        });
    };
}

function forEach(array, callback, thisArg) {
    return all(array, true).then(function(array) {
        return array.forEach(callback, thisArg);
    });
}

function every(array, callback, thisArg) {
    return all(array, true).then(function(array) {
        return array.every(callback, thisArg);
    });
}

function some(array, callback, thisArg) {
    return all(array, true).then(function(array) {
        return array.some(callback, thisArg);
    });
}

function filter(array, callback, thisArg) {
    return all(array, true).then(function(array) {
        return array.filter(callback, thisArg);
    });
}

function map(array, callback, thisArg) {
    return all(array, true).then(function(array) {
        return array.map(callback, thisArg);
    });
}

function reduce(array, callback, initialValue) {
    return all(array, true).then(function(array) {
        return array.reduce(callback, initialValue);
    });
}

function reduceRight(array, callback, initialValue) {
    return all(array, true).then(function(array) {
        return array.reduceRight(callback, initialValue);
    });
}

Object.defineProperties(Future, {
    // port from Dart
    delayed: { value: delayed },
    error: { value: error },
    sync: { value: sync },
    value: { value: value },
    // Promise compatible
    all: { value: all },
    race: { value: race },
    resolve: { value: value },
    reject: { value: error },
    // extended methods
    promise: { value: promise },
    isFuture: { value: isFuture },
    isPromise: { value: isPromise },
    join: { value: join },
    any: { value: any },
    settle: { value: settle },
    attempt: { value: attempt },
    run: { value: run },
    wrap: { value: wrap },
    // for array
    forEach: { value: forEach },
    every: { value: every },
    some: { value: some },
    filter: { value: filter },
    map: { value: map },
    reduce: { value: reduce },
    reduceRight: { value: reduceRight }
});

Object.defineProperties(Future.prototype, {
    _value: { writable: true },
    _reason: { writable: true },
    _state: { value: PENDING, writable: true },
    _resolve: { value: function(onfulfill, onreject, next, x) {
        if (isPromise(x)) {
            if (x === this) {
                throw new TypeError('Self resolution');
            }
            x.then(onfulfill, onreject)
             .then(next.resolve, next.reject);
            return;
        }
        if ((x !== null) &&
            (typeof x === 'object') ||
            (typeof x === 'function')) {
            var then;
            try {
                then = x.then;
            }
            catch (e) {
                if (onreject) {
                    this._call(onreject, next, e);
                }
                else {
                    next.reject(e);
                }
                return;
            }
            if (typeof then === 'function') {
                try {
                    var f = then.call(x, onfulfill, onreject);
                    f.then(next.resolve, next.reject);
                }
                catch (e) {
                    next.reject(e);
                }
                return;
            }
        }
        if (onfulfill) {
            this._call(onfulfill, next, x);
        }
        else {
            next.resolve(x);
        }
    } },
    // Calling complete must not be done more than once.
    resolve: { value: function(value) {
        if (this._state === PENDING) {
            this._state = FULFILLED;
            this._value = value;
            var subscribers = this._subscribers;
            while (subscribers.length > 0) {
                var subscriber = subscribers.shift();
                this._resolve(subscriber.onfulfill,
                              subscriber.onreject,
                              subscriber.next,
                              value);
            }
        }
    } },
    // Calling complete must not be done more than once.
    reject: { value: function(reason) {
        if (this._state === PENDING) {
            this._state = REJECTED;
            this._reason = reason;
            var subscribers = this._subscribers;
            while (subscribers.length > 0) {
                var subscriber = subscribers.shift();
                if (subscriber.onreject) {
                    this._call(subscriber.onreject,
                               subscriber.next,
                               reason);
                }
                else {
                    subscriber.next.reject(reason);
                }
            }
        }
    } },
    then: { value: function(onfulfill, onreject) {
        if (typeof onfulfill !== 'function') onfulfill = null;
        if (typeof onreject !== 'function') onreject = null;
        if (onfulfill || onreject) {
            var next = new Future(this._sync);
            if (this._state === FULFILLED) {
                if (onfulfill) {
                    this._resolve(onfulfill, onreject, next, this._value);
                }
                else {
                    next.resolve(this._value);
                }
            }
            else if (this._state === REJECTED) {
                if (onreject) {
                    this._call(onreject, next, this._reason);
                }
                else {
                    next.reject(this._reason);
                }
            }
            else {
                this._subscribers.push({
                    onfulfill: onfulfill,
                    onreject: onreject,
                    next: next
                });
            }
            return next;
        }
        return this;
    } },
    inspect: { value: function() {
        switch (this._state) {
            case PENDING: return { state: 'pending' };
            case FULFILLED: return { state: 'fulfilled', value: this._value };
            case REJECTED: return { state: 'rejected', reason: this._reason };
        }
    } },
    catchError: { value: function(onreject, test) {
        if (typeof test === 'function') {
            var self = this;
            return this['catch'](function(e) {
                return (test(e) ? self['catch'](onreject) : self);
            });
        }
        return this['catch'](onreject);
    } },
    'catch': { value: function(onreject) {
        return this.then(null, onreject);
    } },
    whenComplete: { value: function(action) {
        return this.then(
            function(v) {
                var f = action();
                if (f === undefined) return v;
                f = isPromise(f) ? f : value(f);
                return f.then(function() { return v; });
            },
            function(e) {
                var f = action();
                if (f === undefined) throw e;
                f = isPromise(f) ? f : value(f);
                return f.then(function() { throw e; });
            }
        );
    } },
    timeout: { value: function(duration, reason) {
        var future = new Future();
        var timeoutId = setTimeout(function() {
            future.reject(reason || new TimeoutError('timeout'));
        }, duration);
        this.whenComplete(function() { clearTimeout(timeoutId); })
            .then(future.resolve, future.reject);
        return future;
    } },
    delay: { value: function(duration) {
        var future = new Future();
        this.then(function(result) {
            setTimeout(function() {
                future.resolve(result);
            }, duration);
        },
        future.reject);
        return future;
    } },
    tap: { value: function(onfulfilledSideEffect, thisArg) {
        return this.then(function(result) {
            onfulfilledSideEffect.call(thisArg, result);
            return result;
        });
    } },
    spread: { value: function(onfulfilledArray, thisArg) {
        return this.then(function(array) {
            return onfulfilledArray.apply(thisArg, array);
        });
    } },
    get: { value: function(key) {
        return this.then(function(result) {
            return result[key];
        });
    } },
    set: { value: function(key, value) {
        return this.then(function(result) {
            result[key] = value;
            return result;
        });
    } },
    apply: { value: function(method, args) {
        args = args || [];
        return this.then(function(result) {
            return all(args, true).then(function(args) {
                return result[method].apply(result, args);
            });
        });
    } },
    call: { value: function(method) {
        var args = slice(arguments, 1);
        return this.then(function(result) {
            return all(args, true).then(function(args) {
                return result[method].apply(result, args);
            });
        });
    } },
    bind: { value: function(method) {
        var bindargs = slice(arguments);
        if (Array.isArray(method)) {
            for (var i = 0, n = method.length; i < n; ++i) {
                bindargs[0] = method[i];
                this.bind.apply(this, bindargs);
            }
        }
        bindargs.shift();
        var self = this;
        Object.defineProperty(this, method, { value: function() {
            var args = slice(arguments);
            return self.then(function(result) {
                return all(bindargs.concat(args), true).then(function(args) {
                    return result[method].apply(result, args);
                });
            });
        } });
        return this;
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
    var future = new Future(sync);
    Object.defineProperties(this, {
        future: { value: future },
        // Calling complete must not be done more than once.
        complete: { value: future.resolve },
        // Calling complete must not be done more than once.
        completeError: { value: future.reject },
        isCompleted: { get: function() {
            return ( future._state !== PENDING );
        } }
    });
}


Object.defineProperties(Completer, {
    sync: { value : function() { return new Completer(true); } }
});

global.hprose.Completer = Completer;

if (hasPromise) return;

global.Promise = function(executor) {
    Future.call(this);
    executor(this.resolve, this.reject);
};

global.Promise.prototype = Object.create(Future.prototype);
global.Promise.prototype.constructor = Future;

Object.defineProperties(global.Promise, {
    all: { value: all },
    race: { value: race },
    resolve: { value: value },
    reject: { value: error }
});
