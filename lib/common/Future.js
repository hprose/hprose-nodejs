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
 * LastModified: Jun 22, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

function Future() {}

function isFuture(obj) {
    return obj instanceof Future;
}

function isPromise(obj) {
    return (obj && (typeof obj.then === "function"));
}

var pending = 0;
var fulfilled = 1;
var rejected = 2;


function Completer() {
    var _status = pending;
    var _result;
    var _error;
    var _callbacks = [];
    var _future = new Future();

    function run(callback, value) {
        var completer = new Completer();
        global.setTimeout(function() {
            try {
                completer.complete(callback(value));
            }
            catch(e) {
                completer.completeError(e);
            }
        }, 0);
        return completer.future;
    }

    function runComplete(onComplete, onError, result) {
        if (isFuture(result)) {
            if (result === _future) {
                throw new TypeError('Self resolution');
            }
            return result.then(onComplete, onError);
        }
        else if (isPromise(result)) {
            var completer = new Completer();
            try {
                result.then(completer.complete, completer.completeError);
            }
            catch (e) {
                completer.completeError(e);
            }
            return completer.future;
        }
        else if (onComplete) {
            return run(onComplete, result);
        }
        return result;
    }

    // Calling complete must not be done more than once.
    function complete(result) {
        if (_status === pending) {
            _status = fulfilled;
            _result = result;
            while (_callbacks.length > 0) {
                var callback = _callbacks.shift();
                _result = runComplete(callback[0], callback[1], _result);
            }
            _result = result;
        }
    }

    // Calling complete must not be done more than once.
    function completeError(error) {
        if (_status === pending) {
            _status = rejected;
            _error = error;
            while (_callbacks.length > 0) {
                var callback = _callbacks.shift();
                if (callback[1]) {
                    _result = run(callback[1], _error);
                    break;
                }
            }
            if (_callbacks.length > 0) {
                while (_callbacks.length > 0) {
                    var callback = _callbacks.shift();
                    _result = runComplete(callback[0], callback[1], _result);
                }
            }
            _error = error;
        }
    }

    function then(onComplete, onError) {
        if (typeof onComplete !== "function") onComplete = null;
        if (typeof onError !== "function") onError = null;
        if (onComplete || onError) {
            if (onComplete && (_status === fulfilled)) {
                 return runComplete(onComplete, onError, _result);
            }
            if (onError && (_status === rejected)) {
                return run(onError, _error);
            }
            _callbacks.push([onComplete, onError]);
        }
        return _future;
    }

    function catchError(onError) {
        return then(null, onError);
    }

    Object.defineProperties(_future, {
        then: { value: then },
        catchError: { value: catchError },
    });

    Object.defineProperties(this, {
        future: { get: function() { return _future; } },
        complete: { value : complete },
        completeError: { value : completeError }
    });
}

Object.defineProperty(Completer, 'isFuture', { value: isFuture });
Object.defineProperty(Completer, 'isPromise', { value: isPromise });

global.hprose.Completer = Completer;
