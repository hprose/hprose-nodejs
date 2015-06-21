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
 * LastModified: Jun 21, 2015                             *
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

function Completer() {
    var _result = [];
    var _error = [];
    var _callback = [];
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
        if (_result.length === 0) {
            _result[0] = result;
            while (_callback.length > 0) {
                var callback = _callback.shift();
                _result[0] = runComplete(callback[0], callback[1], _result[0]);
            }
        }
    }

    // Calling complete must not be done more than once.
    function completeError(e) {
        if (_error.length === 0) {
            _error[0] = _error;
            while (_callback.length > 0) {
                var callback = _callback.shift();
                if (callback[1]) {
                    _result[0] = run(callback[1], _error[0]);
                    break;
                }
            }
            while (_callback.length > 0) {
                var callback = _callback.shift();
                _result[0] = runComplete(callback[0], callback[1], _result[0]);
            }
        }
    }

    function then(onComplete, onError) {
        if (typeof onComplete !== "function") onComplete = null;
        if (typeof onError !== "function") onError = null;
        if ((onComplete === null) && (onError === null)) return _future;
        if (onComplete && (_result.length > 0)) {
             return _result[0] = runComplete(onComplete, onError, _result[0]);
        }
        if (onError && (_error.length > 0)) {
            return _result[0] = run(onError, _error[0]);
        }
        _callback.push([onComplete, onError]);
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
