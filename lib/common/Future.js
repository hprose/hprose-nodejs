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
 * LastModified: Dec 5, 2016                              *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

(function() {
    'use strict';

    var TimeoutError = require('./TimeoutError');

    var PENDING = 0;
    var FULFILLED = 1;
    var REJECTED = 2;

    var hasPromise = 'Promise' in global;
    var setTimeout = global.setTimeout;
    var clearTimeout = global.clearTimeout;
    var foreach = Array.prototype.forEach;
    var slice = Array.prototype.slice;

    function Future(computation) {
        var self = this;
        Object.defineProperties(this, {
            _subscribers: { value: [] },
            resolve: { value: this.resolve.bind(this) },
            reject: { value: this.reject.bind(this) }
        });
        if (typeof computation === 'function') {
            process.nextTick(function() {
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

    function toFuture(obj) {
        return isFuture(obj) ? obj : value(obj);
    }

    function isPromise(obj) {
        return 'function' === typeof obj.then;
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

    function value(v) {
        var future = new Future();
        future.resolve(v);
        return future;
    }

    function sync(computation) {
        try {
            var result = computation();
            return value(result);
        }
        catch(e) {
            return error(e);
        }
    }

    function promise(executor) {
        var future = new Future();
        executor(future.resolve, future.reject);
        return future;
    }

    function arraysize(array) {
        var size = 0;
        foreach.call(array, function() { ++size; });
        return size;
    }

    function all(array) {
        return toFuture(array).then(function(array) {
            var n = array.length;
            var count = arraysize(array);
            var result = new Array(n);
            if (count === 0) { return result; }
            var future = new Future();
            foreach.call(array, function(element, index) {
                toFuture(element).then(function(value) {
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

    function race(array) {
        return toFuture(array).then(function(array) {
            var future = new Future();
            foreach.call(array, function(element) {
                toFuture(element).fill(future);
            });
            return future;
        });
    }

    function any(array) {
        return toFuture(array).then(function(array) {
            var n = array.length;
            var count = arraysize(array);
            if (count === 0) {
                throw new RangeError('any(): array must not be empty');
            }
            var reasons = new Array(n);
            var future = new Future();
            foreach.call(array, function(element, index) {
                toFuture(element).then(future.resolve, function(e) {
                    reasons[index] = e;
                    if (--count === 0) {
                        future.reject(reasons);
                    }
                });
            });
            return future;
        });
    }

    function settle(array) {
        return toFuture(array).then(function(array) {
            var n = array.length;
            var count = arraysize(array);
            var result = new Array(n);
            if (count === 0) { return result; }
            var future = new Future();
            foreach.call(array, function(element, index) {
                var f = toFuture(element);
                f.complete(function() {
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
        var thisArg = (function() { return this; })();
        var args = slice.call(arguments, 1);
        return all(args).then(function(args) {
            return handler.apply(thisArg, args);
        });
    }

    function run(handler, thisArg/*, arg1, arg2, ... */) {
        var args = slice.call(arguments, 2);
        return all(args).then(function(args) {
            return handler.apply(thisArg, args);
        });
    }

    function isGenerator(obj) {
        if (!obj) {
            return false;
        }
        return 'function' == typeof obj.next && 'function' == typeof obj['throw'];
    }

    function isGeneratorFunction(obj) {
        if (!obj) {
            return false;
        }
        var constructor = obj.constructor;
        if (!constructor) {
            return false;
        }
        if ('GeneratorFunction' === constructor.name ||
            'GeneratorFunction' === constructor.displayName) {
            return true;
        }
        return isGenerator(constructor.prototype);
    }

    function getThunkCallback(future) {
        return function(err, res) {
            if (err instanceof Error) {
                return future.reject(err);
            }
            if (arguments.length < 2) {
                return future.resolve(err);
            }
            if (err === null || err === undefined) {
                res = slice.call(arguments, 1);
            }
            else {
                res = slice.call(arguments, 0);
            }
            if (res.length == 1) {
                future.resolve(res[0]);
            }
            else {
                future.resolve(res);
            }
        };
    }

    function thunkToPromise(fn) {
        if (isGeneratorFunction(fn) || isGenerator(fn)) {
            return co(fn);
        }
        var thisArg = (function() { return this; })();
        var future = new Future();
        fn.call(thisArg, getThunkCallback(future));
        return future;
    }

    function thunkify(fn) {
        return function() {
            var args = slice.call(arguments, 0);
            var thisArg = this;
            var results = new Future();
            args.push(function() {
                thisArg = this;
                results.resolve(arguments);
            });
            try {
                fn.apply(this, args);
            }
            catch (err) {
                results.resolve([err]);
            }
            return function(done) {
                results.then(function(results) {
                    done.apply(thisArg, results);
                });
            };
        };
    }

    function promisify(fn) {
        return function() {
            var args = slice.call(arguments, 0);
            var future = new Future();
            args.push(getThunkCallback(future));
            try {
                fn.apply(this, args);
            }
            catch (err) {
                future.reject(err);
            }
            return future;
        };
    }

    function toPromise(obj) {
        if (isGeneratorFunction(obj) || isGenerator(obj)) {
            return co(obj);
        }
        return toFuture(obj);
    }

    function co(gen) {
        var thisArg = (function() { return this; })();
        if (typeof gen === 'function') {
            var args = slice.call(arguments, 1);
            gen = gen.apply(thisArg, args);
        }

        if (!gen || typeof gen.next !== 'function') {
            return toFuture(gen);
        }

        var future = new Future();

        function onFulfilled(res) {
            try {
                next(gen.next(res));
            }
            catch (e) {
                future.reject(e);
            }
        }

        function onRejected(err) {
            try {
                next(gen['throw'](err));
            }
            catch (e) {
                future.reject(e);
            }
        }

        function next(ret) {
            if (ret.done) {
                future.resolve(ret.value);
            }
            else {
                (('function' == typeof ret.value) ?
                thunkToPromise(ret.value) :
                toPromise(ret.value)).then(onFulfilled, onRejected);
            }
        }

        onFulfilled();

        return future;
    }

    function wrap(handler, thisArg) {
        return function() {
            thisArg = thisArg || this;
            return all(arguments).then(function(args) {
                var result = handler.apply(thisArg, args);
                if (isGeneratorFunction(result) || isGenerator(result)) {
                    return co.call(thisArg, result);
                }
                return result;
            });
        };
    }

    co.wrap = wrap;

    function forEach(array, callback, thisArg) {
        thisArg = thisArg || (function() { return this; })();
        return all(array).then(function(array) {
            return array.forEach(callback, thisArg);
        });
    }

    function every(array, callback, thisArg) {
        thisArg = thisArg || (function() { return this; })();
        return all(array).then(function(array) {
            return array.every(callback, thisArg);
        });
    }

    function some(array, callback, thisArg) {
        thisArg = thisArg || (function() { return this; })();
        return all(array).then(function(array) {
            return array.some(callback, thisArg);
        });
    }

    function filter(array, callback, thisArg) {
        thisArg = thisArg || (function() { return this; })();
        return all(array).then(function(array) {
            return array.filter(callback, thisArg);
        });
    }

    function map(array, callback, thisArg) {
        thisArg = thisArg || (function() { return this; })();
        return all(array).then(function(array) {
            return array.map(callback, thisArg);
        });
    }

    function reduce(array, callback, initialValue) {
        if (arguments.length > 2) {
            return all(array).then(function(array) {
                return toFuture(initialValue).then(function(value) {
                    return array.reduce(callback, value);
                });
            });
        }
        return all(array).then(function(array) {
            return array.reduce(callback);
        });
    }

    function reduceRight(array, callback, initialValue) {
        if (arguments.length > 2) {
            return all(array).then(function(array) {
                return toFuture(initialValue).then(function(value) {
                    return array.reduceRight(callback, value);
                });
            });
        }
        return all(array).then(function(array) {
            return array.reduceRight(callback);
        });
    }

    function indexOf(array, searchElement, fromIndex) {
        return all(array).then(function(array) {
            return toFuture(searchElement).then(function(searchElement) {
                return array.indexOf(searchElement, fromIndex);
            });
        });
    }

    function lastIndexOf(array, searchElement, fromIndex) {
        return all(array).then(function(array) {
            return toFuture(searchElement).then(function(searchElement) {
                if (fromIndex === undefined) {
                    fromIndex = array.length - 1;
                }
                return array.lastIndexOf(searchElement, fromIndex);
            });
        });
    }

    function includes(array, searchElement, fromIndex) {
        return all(array).then(function(array) {
            return toFuture(searchElement).then(function(searchElement) {
                return array.includes(searchElement, fromIndex);
            });
        });
    }

    function find(array, predicate, thisArg) {
        thisArg = thisArg || (function() { return this; })();
        return all(array).then(function(array) {
            return array.find(predicate, thisArg);
        });
    }

    function findIndex(array, predicate, thisArg) {
        thisArg = thisArg || (function() { return this; })();
        return all(array).then(function(array) {
            return array.findIndex(predicate, thisArg);
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
        toFuture: { value: toFuture },
        isPromise: { value: isPromise },
        toPromise: { value: toPromise },
        join: { value: join },
        any: { value: any },
        settle: { value: settle },
        attempt: { value: attempt },
        run: { value: run },
        thunkify: { value: thunkify },
        promisify: { value: promisify },
        co: { value: co },
        wrap: { value: wrap },
        // for array
        forEach: { value: forEach },
        every: { value: every },
        some: { value: some },
        filter: { value: filter },
        map: { value: map },
        reduce: { value: reduce },
        reduceRight: { value: reduceRight },
        indexOf: { value: indexOf },
        lastIndexOf: { value: lastIndexOf },
        includes: { value: includes },
        find: { value: find },
        findIndex: { value: findIndex }
    });

    function _call(callback, next, x) {
        process.nextTick(function() {
            try {
                var r = callback(x);
                next.resolve(r);
            }
            catch(e) {
                next.reject(e);
            }
        });
    }

    function _resolve(onfulfill, next, x) {
        if (onfulfill) {
            _call(onfulfill, next, x);
        }
        else {
            next.resolve(x);
        }
    }

    function _reject(onreject, next, e) {
        if (onreject) {
            _call(onreject, next, e);
        }
        else {
            next.reject(e);
        }
    }

    Object.defineProperties(Future.prototype, {
        _value: { writable: true },
        _reason: { writable: true },
        _state: { value: PENDING, writable: true },
        resolve: { value: function(value) {
            if (value === this) {
                this.reject(new TypeError('Self resolution'));
                return;
            }
            if (isFuture(value)) {
                value.fill(this);
                return;
            }
            if ((value !== null) &&
                (typeof value === 'object') ||
                (typeof value === 'function')) {
                var then;
                try {
                    then = value.then;
                }
                catch (e) {
                    this.reject(e);
                    return;
                }
                if (typeof then === 'function') {
                    var notrun = true;
                    try {
                        var self = this;
                        then.call(value, function(y) {
                            if (notrun) {
                                notrun = false;
                                self.resolve(y);
                            }
                        }, function(r) {
                            if (notrun) {
                                notrun = false;
                                self.reject(r);
                            }
                        });
                        return;
                    }
                    catch (e) {
                        if (notrun) {
                            notrun = false;
                            this.reject(e);
                        }
                    }
                    return;
                }
            }
            if (this._state === PENDING) {
                this._state = FULFILLED;
                this._value = value;
                var subscribers = this._subscribers;
                while (subscribers.length > 0) {
                    var subscriber = subscribers.shift();
                    _resolve(subscriber.onfulfill, subscriber.next, value);
                }
            }
        } },
        reject: { value: function(reason) {
            if (this._state === PENDING) {
                this._state = REJECTED;
                this._reason = reason;
                var subscribers = this._subscribers;
                while (subscribers.length > 0) {
                    var subscriber = subscribers.shift();
                    _reject(subscriber.onreject, subscriber.next, reason);
                }
            }
        } },
        then: { value: function(onfulfill, onreject) {
            if (typeof onfulfill !== 'function') { onfulfill = null; }
            if (typeof onreject !== 'function') { onreject = null; }
            var next = new Future();
            if (this._state === FULFILLED) {
                _resolve(onfulfill, next, this._value);
            }
            else if (this._state === REJECTED) {
                _reject(onreject, next, this._reason);
            }
            else {
                this._subscribers.push({
                    onfulfill: onfulfill,
                    onreject: onreject,
                    next: next
                });
            }
            return next;
        } },
        done: { value: function(onfulfill, onreject) {
            this.then(onfulfill, onreject).then(null, function(error) {
                process.nextTick(function() { throw error; });
            });
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
                    if (test(e)) {
                        return self['catch'](onreject);
                    }
                    else {
                        throw e;
                    }
                });
            }
            return this['catch'](onreject);
        } },
        'catch': { value: function(onreject) {
            return this.then(null, onreject);
        } },
        fail: { value: function(onreject) {
            this.done(null, onreject);
        } },
        whenComplete: { value: function(action) {
            return this.then(
                function(v) { action(); return v; },
                function(e) { action(); throw e; }
            );
        } },
        complete: { value: function(oncomplete) {
            oncomplete = oncomplete || function(v) { return v; };
            return this.then(oncomplete, oncomplete);
        } },
        always: { value: function(oncomplete) {
           this.done(oncomplete, oncomplete);
        } },
        fill: { value: function(future) {
           this.then(future.resolve, future.reject);
        } },
        timeout: { value: function(duration, reason) {
            var future = new Future();
            var timeoutId = setTimeout(function() {
                future.reject(reason || new TimeoutError('timeout'));
            }, duration);
            this.whenComplete(function() { clearTimeout(timeoutId); })
                .fill(future);
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
                return all(args).then(function(args) {
                    return result[method].apply(result, args);
                });
            });
        } },
        call: { value: function(method) {
            var args = slice.call(arguments, 1);
            return this.then(function(result) {
                return all(args).then(function(args) {
                    return result[method].apply(result, args);
                });
            });
        } },
        bind: { value: function(method) {
            var bindargs = slice.call(arguments);
            if (Array.isArray(method)) {
                for (var i = 0, n = method.length; i < n; ++i) {
                    bindargs[0] = method[i];
                    this.bind.apply(this, bindargs);
                }
                return;
            }
            bindargs.shift();
            var self = this;
            Object.defineProperty(this, method, { value: function() {
                var args = slice.call(arguments);
                return self.then(function(result) {
                    return all(bindargs.concat(args)).then(function(args) {
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
            if (arguments.length > 1) {
                return reduce(this, callback, initialValue);
            }
            return reduce(this, callback);
        } },
        reduceRight: { value: function(callback, initialValue) {
            if (arguments.length > 1) {
                return reduceRight(this, callback, initialValue);
            }
            return reduceRight(this, callback);
        } },
        indexOf: { value: function(searchElement, fromIndex) {
            return indexOf(this, searchElement, fromIndex);
        } },
        lastIndexOf: { value: function(searchElement, fromIndex) {
            return lastIndexOf(this, searchElement, fromIndex);
        } },
        includes: { value: function(searchElement, fromIndex) {
            return includes(this, searchElement, fromIndex);
        } },
        find: { value: function(predicate, thisArg) {
            return find(this, predicate, thisArg);
        } },
        findIndex: { value: function(predicate, thisArg) {
            return findIndex(this, predicate, thisArg);
        } }
    });

    global.hprose.Future = Future;

    global.hprose.thunkify = thunkify;
    global.hprose.promisify = promisify;
    global.hprose.co = co;
    global.hprose.co.wrap = global.hprose.wrap = wrap;

    function Completer() {
        var future = new Future();
        Object.defineProperties(this, {
            future: { value: future },
            complete: { value: future.resolve },
            completeError: { value: future.reject },
            isCompleted: { get: function() {
                return ( future._state !== PENDING );
            } }
        });
    }

    global.hprose.Completer = Completer;

    global.hprose.resolved = value;

    global.hprose.rejected = error;

    global.hprose.deferred = function() {
        var self = new Future();
        return Object.create(null, {
            promise: { value: self },
            resolve: { value: self.resolve },
            reject: { value: self.reject }
        });
    };

    if (hasPromise) { return; }

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
})();
