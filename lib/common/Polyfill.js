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
 * Polyfill.js                                            *
 *                                                        *
 * Polyfill for Node.js.                                  *
 *                                                        *
 * LastModified: Mar 3, 2016                              *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

'use strict';
/* Function */
if (!Function.prototype.bind) {
    Object.defineProperty(Function.prototype, 'bind', { value: function(oThis) {
        if (typeof this !== 'function') {
            throw new TypeError('Function.prototype.bind - what is trying to be bound is not callable');
        }
        var aArgs   = Array.prototype.slice.call(arguments, 1),
            toBind = this,
            NOP    = function() {},
            bound  = function() {
                return toBind.apply(this instanceof NOP ? this : oThis,
                        aArgs.concat(Array.prototype.slice.call(arguments)));
            };
        if (this.prototype) {
            NOP.prototype = this.prototype;
        }
        bound.prototype = new NOP();
        return bound;
    } });
}
/* Array */
if (!Array.prototype.includes) {
    Object.defineProperty(Array.prototype, 'includes', { value: function(searchElement /*, fromIndex*/ ) {
        var O = Object(this);
        var len = parseInt(O.length, 10) || 0;
        if (len === 0) {
            return false;
        }
        var n = parseInt(arguments[1], 10) || 0;
        var k;
        if (n >= 0) {
            k = n;
        }
        else {
            k = len + n;
            if (k < 0) { k = 0; }
        }
        var currentElement;
        while (k < len) {
            currentElement = O[k];
            if (searchElement === currentElement ||
                (searchElement !== searchElement && currentElement !== currentElement)) { // NaN !== NaN
                return true;
            }
            k++;
        }
        return false;
    } });
}
if (!Array.prototype.find) {
    Object.defineProperty(Array.prototype, 'find', { value: function(predicate) {
        if (this === null || this === undefined) {
            throw new TypeError('Array.prototype.find called on null or undefined');
        }
        if (typeof predicate !== 'function') {
            throw new TypeError('predicate must be a function');
        }
        var list = Object(this);
        var length = list.length >>> 0;
        var thisArg = arguments[1];
        var value;
        for (var i = 0; i < length; i++) {
            value = list[i];
            if (predicate.call(thisArg, value, i, list)) {
                return value;
            }
        }
        return undefined;
    } });
}
if (!Array.prototype.findIndex) {
    Object.defineProperty(Array.prototype, 'findIndex', { value: function(predicate) {
        if (this === null || this === undefined) {
            throw new TypeError('Array.prototype.findIndex called on null or undefined');
        }
        if (typeof predicate !== 'function') {
            throw new TypeError('predicate must be a function');
        }
        var list = Object(this);
        var length = list.length >>> 0;
        var thisArg = arguments[1];
        var value;

        for (var i = 0; i < length; i++) {
            value = list[i];
            if (predicate.call(thisArg, value, i, list)) {
                return i;
            }
        }
        return -1;
    } });
}
if (!Array.prototype.fill) {
    Object.defineProperty(Array.prototype, 'fill', { value: function(value) {
        if (this === null || this === undefined) {
            throw new TypeError('this is null or not defined');
        }
        var O = Object(this);
        var len = O.length >>> 0;
        var start = arguments[1];
        var relativeStart = start >> 0;
        var k = relativeStart < 0 ? Math.max(len + relativeStart, 0) : Math.min(relativeStart, len);
        var end = arguments[2];
        var relativeEnd = end === undefined ? len : end >> 0;
        var f = relativeEnd < 0 ? Math.max(len + relativeEnd, 0) : Math.min(relativeEnd, len);

        while (k < f) {
            O[k] = value;
            k++;
        }
        return O;
    } });
}
if (!Array.prototype.copyWithin) {
    Object.defineProperty(Array.prototype, 'copyWithin', { value: function(target, start/*, end*/) {
        if (this === null || this === undefined) {
            throw new TypeError('this is null or not defined');
        }
        var O = Object(this);
        var len = O.length >>> 0;
        var relativeTarget = target >> 0;
        var to = relativeTarget < 0 ? Math.max(len + relativeTarget, 0) : Math.min(relativeTarget, len);
        var relativeStart = start >> 0;
        var from = relativeStart < 0 ? Math.max(len + relativeStart, 0) : Math.min(relativeStart, len);
        var end = arguments[2];
        var relativeEnd = end === undefined ? len : end >> 0;
        var f = relativeEnd < 0 ? Math.max(len + relativeEnd, 0) : Math.min(relativeEnd, len);
        var count = Math.min(f - from, len - to);
        var direction = 1;
        if (from < to && to < (from + count)) {
            direction = -1;
            from += count - 1;
            to += count - 1;
        }
        while (count > 0) {
            if (from in O) {
                O[to] = O[from];
            }
            else {
                delete O[to];
            }
            from += direction;
            to += direction;
            count--;
        }
        return O;
    } });
}
if (!Array.from) {
    Object.defineProperty(Array, 'from', { value: (function() {
        var toStr = Object.prototype.toString;
        var isCallable = function(fn) {
            return typeof fn === 'function' || toStr.call(fn) === '[object Function]';
        };
        var toInteger = function(value) {
            var number = Number(value);
            if (isNaN(number)) { return 0; }
            if (number === 0 || !isFinite(number)) { return number; }
            return (number > 0 ? 1 : -1) * Math.floor(Math.abs(number));
        };
        var maxSafeInteger = Math.pow(2, 53) - 1;
        var toLength = function(value) {
            var len = toInteger(value);
            return Math.min(Math.max(len, 0), maxSafeInteger);
        };

        return function(arrayLike/*, mapFn, thisArg */) {
            var C = this;
            var items = Object(arrayLike);
            if (arrayLike === null || arrayLike === undefined) {
                throw new TypeError("Array.from requires an array-like object - not null or undefined");
            }
            var mapFn = arguments.length > 1 ? arguments[1] : void undefined;
            var T;
            if (typeof mapFn !== 'undefined') {
                if (!isCallable(mapFn)) {
                    throw new TypeError('Array.from: when provided, the second argument must be a function');
                }
                if (arguments.length > 2) {
                    T = arguments[2];
                }
            }
            var len = toLength(items.length);
            var A = isCallable(C) ? Object(new C(len)) : new Array(len);
            var k = 0;
            var kValue;
            while (k < len) {
                kValue = items[k];
                if (mapFn) {
                    A[k] = typeof T === 'undefined' ? mapFn(kValue, k) : mapFn.call(T, kValue, k);
                }
                else {
                    A[k] = kValue;
                }
                k += 1;
            }
            A.length = len;
            return A;
        };
    }()) });
}
if (!Array.of) {
    Object.defineProperty(Array, 'of', { value: function() {
        return Array.prototype.slice.call(arguments);
    } });
}
/* String */
if (!String.prototype.startsWith) {
    Object.defineProperty(String.prototype, 'startsWith', { value: function(searchString, position){
        position = position || 0;
        return this.substr(position, searchString.length) === searchString;
    } });
}
if (!String.prototype.endsWith) {
    Object.defineProperty(String.prototype, 'endsWith', { value: function(searchString, position) {
        var subjectString = this.toString();
        if (typeof position !== 'number' || !isFinite(position) || Math.floor(position) !== position || position > subjectString.length) {
            position = subjectString.length;
        }
        position -= searchString.length;
        var lastIndex = subjectString.indexOf(searchString, position);
        return lastIndex !== -1 && lastIndex === position;
    } });
}
if (!String.prototype.includes) {
    Object.defineProperty(String.prototype, 'includes', { value: function() {
        if (typeof arguments[1] === "number") {
            if (this.length < arguments[0].length + arguments[1].length) {
                return false;
            }
            else {
                return this.substr(arguments[1], arguments[0].length) === arguments[0];
            }
        }
        else {
            return String.prototype.indexOf.apply(this, arguments) !== -1;
        }
    } });
}
if (!String.prototype.repeat) {
    Object.defineProperty(String.prototype, 'repeat', { value: function(count) {
        var str = this.toString();
        count = +count;
        if (count !== count) {
            count = 0;
        }
        if (count < 0) {
            throw new RangeError('repeat count must be non-negative');
        }
        if (count === Infinity) {
            throw new RangeError('repeat count must be less than infinity');
        }
        count = Math.floor(count);
        if (str.length === 0 || count === 0) {
            return '';
        }
        // Ensuring count is a 31-bit integer allows us to heavily optimize the
        // main part. But anyway, most current (August 2014) browsers can't handle
        // strings 1 << 28 chars or longer, so:
        if (str.length * count >= 1 << 28) {
          throw new RangeError('repeat count must not overflow maximum string size');
        }
        var rpt = '';
        for (;;) {
            if ((count & 1) === 1) {
                rpt += str;
            }
            count >>>= 1;
            if (count === 0) {
                break;
            }
            str += str;
        }
        // Could we try:
        // return Array(count + 1).join(this);
        return rpt;
    } });
}
if (!String.prototype.trim) {
    Object.defineProperty(String.prototype, 'trim', { value: function() {
        return this.toString().replace(/^[\s\xa0]+|[\s\xa0]+$/g, '');
    } });
}
if (!String.prototype.trimLeft) {
    Object.defineProperty(String.prototype, 'trimLeft', { value: function() {
        return this.toString().replace(/^[\s\xa0]+/, '');
    } });
}
if (!String.prototype.trimRight) {
    Object.defineProperty(String.prototype, 'trimRight', { value: function() {
        return this.toString().replace(/[\s\xa0]+$/, '');
    } });
}
/* Object */
if (!Object.keys) {
    Object.defineProperty(Object, 'keys', { value: (function () {
        var hasOwnProperty = Object.prototype.hasOwnProperty,
            hasDontEnumBug = !({toString: null}).propertyIsEnumerable('toString'),
            dontEnums = [
                'toString',
                'toLocaleString',
                'valueOf',
                'hasOwnProperty',
                'isPrototypeOf',
                'propertyIsEnumerable',
                'constructor'
            ],
            dontEnumsLength = dontEnums.length;
        return function (obj) {
            if (typeof obj !== 'object' && typeof obj !== 'function' || obj === null) {
                throw new TypeError('Object.keys called on non-object');
            }
            var result = [];
            for (var prop in obj) {
                if (hasOwnProperty.call(obj, prop)) {
                    result.push(prop);
                }
            }
            if (hasDontEnumBug) {
                for (var i=0; i < dontEnumsLength; i++) {
                    if (hasOwnProperty.call(obj, dontEnums[i])) {
                        result.push(dontEnums[i]);
                    }
                }
            }
            return result;
        };
    })() });
}
/* Generic methods */
var generic = global.hprose.generic;

function genericMethods(obj, properties) {
    var proto = obj.prototype;
    for (var i = 0, len = properties.length; i < len; i++) {
        var property = properties[i];
        var method = proto[property];
        if (typeof method === 'function' && typeof obj[property] === 'undefined') {
            Object.defineProperty(obj, property, { value: generic(method) });
        }
    }
}
genericMethods(Array, [
    "pop",
    "push",
    "reverse",
    "shift",
    "sort",
    "splice",
    "unshift",
    "concat",
    "join",
    "slice",
    "indexOf",
    "lastIndexOf",
    "filter",
    "forEach",
    "every",
    "map",
    "some",
    "reduce",
    "reduceRight",
    "includes",
    "find",
    "findIndex"
]);
genericMethods(String, [
    'quote',
    'substring',
    'toLowerCase',
    'toUpperCase',
    'charAt',
    'charCodeAt',
    'indexOf',
    'lastIndexOf',
    'include',
    'startsWith',
    'endsWith',
    'repeat',
    'trim',
    'trimLeft',
    'trimRight',
    'toLocaleLowerCase',
    'toLocaleUpperCase',
    'match',
    'search',
    'replace',
    'split',
    'substr',
    'concat',
    'slice'
]);
