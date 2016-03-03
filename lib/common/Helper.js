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
 * hprose/common/Helper.js                                *
 *                                                        *
 * Hprose Helper for Node.js.                             *
 *                                                        *
 * LastModified: Mar 3, 2016                              *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

(function() {
    'use strict';

    function generic(method) {
        if (typeof method !== "function") {
            throw new TypeError(method + " is not a function");
        }
        return function(context) {
            return method.apply(context, Array.prototype.slice.call(arguments, 1));
        };
    }

    var arrayLikeObjectArgumentsEnabled = true;

    try {
        String.fromCharCode.apply(String, new Uint8Array([1]));
    }
    catch (e) {
        arrayLikeObjectArgumentsEnabled = false;
    }

    function toArray(arrayLikeObject) {
        var n = arrayLikeObject.length;
        var a = new Array(n);
        for (var i = 0; i < n; ++i) {
            a[i] = arrayLikeObject[i];
        }
        return a;
    }

    var getCharCodes = arrayLikeObjectArgumentsEnabled ? function(bytes) { return bytes; } : toArray;

    function toBinaryString(bytes) {
        if (bytes instanceof ArrayBuffer) {
            bytes = new Uint8Array(bytes);
        }
        var n = bytes.length;
        if (n < 100000) {
            return String.fromCharCode.apply(String, getCharCodes(bytes));
        }
        var remain = n & 0xFFFF;
        var count = n >> 16;
        var a = new Array(remain ? count + 1 : count);
        for (var i = 0; i < count; ++i) {
            a[i] = String.fromCharCode.apply(String, getCharCodes(bytes.subarray(i << 16, (i + 1) << 16)));
        }
        if (remain) {
            a[count] = String.fromCharCode.apply(String, getCharCodes(bytes.subarray(count << 16, n)));
        }
        return a.join('');
    }

    function toUint8Array(bs) {
        var n = bs.length;
        var data = new Uint8Array(n);
        for (var i = 0; i < n; i++) {
            data[i] = bs.charCodeAt(i) & 0xFF;
        }
        return data;
    }

    global.hprose.generic = generic;
    global.hprose.toBinaryString = toBinaryString;
    global.hprose.toUint8Array = toUint8Array;
    global.hprose.toArray = toArray;

})();
