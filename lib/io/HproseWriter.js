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
 * HproseWriter.js                                        *
 *                                                        *
 * HproseWriter for Node.js.                              *
 *                                                        *
 * LastModified: Mar 29, 2014                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
/*jshint unused:false */
'use strict';

require('../common/HarmonyMaps.js');
var util = require('util');
var HproseTags = require('./HproseTags.js');
var HproseClassManager = require('./HproseClassManager.js');

function isNegZero(value) {
    return (value === 0 && 1/value === -Infinity);
}

function getClassName(obj) {
    var cls = obj.constructor;
    var classname = HproseClassManager.getClassAlias(cls);
    if (classname) return classname;
    if (cls.name) {
        classname = cls.name;
    }
    else {
        var ctor = cls.toString();
        classname = ctor.substr(0, ctor.indexOf('(')).replace(/(^\s*function\s*)|(\s*$)/ig, '');
        if (classname === '' || classname === 'Object') {
            return (typeof(obj.getClassName) === 'function') ? obj.getClassName() : 'Object';
        }
    }
    if (classname !== 'Object') {
        HproseClassManager.register(cls, classname);
    }
    return classname;
}

var fakeWriterRefer = {
    set: function () {},
    write: function () { return false; },
    reset: function () {}
};

var realWriterRefer = function (stream) {
    var ref = new Map();
    var refcount = 0;
    return {
        set: function (val) {
            ref.set(val, refcount++);
        },
        write: function (val) {
            var index = ref.get(val);
            if (index !== undefined) {
                stream.write(HproseTags.TagRef);
                stream.write('' + index);
                stream.write(HproseTags.TagSemicolon);
                return true;
            }
        },
        reset: function () {
            ref = new Map();
            refcount = 0;
        }
    };
};

function HproseWriter(stream, simple) {
    var classref = Object.create(null);
    var fieldsref = [];
    var refer = simple ? fakeWriterRefer : realWriterRefer(stream);
    function serialize(value) {
        if (value === undefined || value === null) {
            stream.write(HproseTags.TagNull);
            return;
        }
        switch (value.constructor) {
        case Function:
            stream.write(HproseTags.TagNull);
            return;
        case Number:
            writeNumber(value);
            return;
        case Boolean:
            writeBoolean(value);
            return;
        case String:
            switch (value.length) {
            case 0:
                stream.write(HproseTags.TagEmpty);
                return;
            case 1:
                stream.write(HproseTags.TagUTF8Char);
                stream.write(value);
                return;
            }
            writeStringWithRef(value);
            return;
        case Map:
            writeHarmonyMapWithRef(value);
            return;
        case ArrayBuffer:
        case Uint8Array:
            writeBytesWithRef(value);
            return;
        case Int8Array:
        case Int16Array:
        case Int32Array:
        case Uint16Array:
        case Uint32Array:
            writeIntListWithRef(value);
            return;
        case Float32Array:
        case Float64Array:
            writeDoubleListWithRef(value);
            return;
        default:
            if (util.isDate(value)) {
                writeDateWithRef(value);
            }
            else if (util.isArray(value)) {
                writeListWithRef(value);
            }
            else if (Buffer.isBuffer(value)) {
                writeBytesWithRef(value);
            }
            else {
                var classname = getClassName(value);
                if (classname === 'Object') {
                    writeMapWithRef(value);
                }
                else {
                    writeObjectWithRef(value);
                }
            }
            break;
        }
    }
    function writeNumber(n) {
        n = n.valueOf();
        if (isNegZero(n)) {
            stream.write([HproseTags.TagInteger,
                          HproseTags.TagNeg,
                          0x30,
                          HproseTags.TagSemicolon]);
        }
        else if (n === (n | 0)) {
            if (0 <= n && n <= 9) {
                stream.write(n + 0x30);
            }
            else {
                stream.write(HproseTags.TagInteger);
                stream.write('' + n);
                stream.write(HproseTags.TagSemicolon);
            }
        }
        else if (isNaN(n)) {
            stream.write(HproseTags.TagNaN);
        }
        else if (isFinite(n)) {
            stream.write(HproseTags.TagDouble);
            stream.write('' + n);
            stream.write(HproseTags.TagSemicolon);
        }
        else {
            stream.write(HproseTags.TagInfinity);
            stream.write((n > 0) ? HproseTags.TagPos : HproseTags.TagNeg);
        }
    }
    function writeInteger(i) {
        if (0 <= i && i <= 9) {
            stream.write(i + 0x30);
        }
        else {
            if (i < -2147483648 || i > 2147483647) {
                stream.write(HproseTags.TagLong);
            }
            else {
                stream.write(HproseTags.TagInteger);
            }
            stream.write('' + i);
            stream.write(HproseTags.TagSemicolon);
        }
    }
    function writeDouble(d) {
        if (isNaN(d)) {
            stream.write(HproseTags.TagNaN);
        }
        else if (isFinite(d)) {
            stream.write(HproseTags.TagDouble);
            if (isNegZero(d)) {
                stream.write([HproseTags.TagNeg, 0x30]); // -0
            }
            else {
                stream.write('' + d);
            }
            stream.write(HproseTags.TagSemicolon);
        }
        else {
            stream.write(HproseTags.TagInfinity);
            stream.write((d > 0) ? HproseTags.TagPos : HproseTags.TagNeg);
        }
    }
    function writeBoolean(b) {
        stream.write(b.valueOf() ? HproseTags.TagTrue : HproseTags.TagFalse);
    }
    function writeUTCDate(date) {
        refer.set(date);
        var year = ('0000' + date.getUTCFullYear()).slice(-4);
        var month = ('00' + (date.getUTCMonth() + 1)).slice(-2);
        var day = ('00' + date.getUTCDate()).slice(-2);
        var hour = ('00' + date.getUTCHours()).slice(-2);
        var minute = ('00' + date.getUTCMinutes()).slice(-2);
        var second = ('00' + date.getUTCSeconds()).slice(-2);
        var millisecond = ('000' + date.getUTCMilliseconds()).slice(-3);
        stream.write(HproseTags.TagDate);
        stream.write(year + month + day);
        stream.write(HproseTags.TagTime);
        stream.write(hour + minute + second);
        if (millisecond !== '000') {
            stream.write(HproseTags.TagPoint);
            stream.write(millisecond);
        }
        stream.write(HproseTags.TagUTC);
    }
    function writeUTCDateWithRef(date) {
        if (!refer.write(date)) writeUTCDate(date);
    }
    function writeDate(date) {
        refer.set(date);
        var year = ('0000' + date.getFullYear()).slice(-4);
        var month = ('00' + (date.getMonth() + 1)).slice(-2);
        var day = ('00' + date.getDate()).slice(-2);
        var hour = ('00' + date.getHours()).slice(-2);
        var minute = ('00' + date.getMinutes()).slice(-2);
        var second = ('00' + date.getSeconds()).slice(-2);
        var millisecond = ('000' + date.getMilliseconds()).slice(-3);
        if ((hour === '00') && (minute === '00') &&
            (second === '00') && (millisecond === '000')) {
            stream.write(HproseTags.TagDate);
            stream.write(year + month + day);
        }
        else if ((year === '1970') && (month === '01') && (day === '01')) {
            stream.write(HproseTags.TagTime);
            stream.write(hour + minute + second);
            if (millisecond !== '000') {
                stream.write(HproseTags.TagPoint);
                stream.write(millisecond);
            }
        }
        else {
            stream.write(HproseTags.TagDate);
            stream.write(year + month + day);
            stream.write(HproseTags.TagTime);
            stream.write(hour + minute + second);
            if (millisecond !== '000') {
                stream.write(HproseTags.TagPoint);
                stream.write(millisecond);
            }
        }
        stream.write(HproseTags.TagSemicolon);
    }
    function writeDateWithRef(date) {
        if (!refer.write(date)) writeDate(date);
    }
    function writeTime(time) {
        refer.set(time);
        var hour = ('00' + time.getHours()).slice(-2);
        var minute = ('00' + time.getMinutes()).slice(-2);
        var second = ('00' + time.getSeconds()).slice(-2);
        var millisecond = ('000' + time.getMilliseconds()).slice(-3);
        stream.write(HproseTags.TagTime);
        stream.write(hour + minute + second);
        if (millisecond !== '000') {
            stream.write(HproseTags.TagPoint);
            stream.write(millisecond);
        }
        stream.write(HproseTags.TagSemicolon);
    }
    function writeTimeWithRef(time) {
        if (!refer.write(time)) writeTime(time);
    }
    function writeBytes(bytes) {
        refer.set(bytes);
        var n = bytes.byteLength || bytes.length;
        stream.write(HproseTags.TagBytes);
        if (n > 0) stream.write('' + n);
        stream.write(HproseTags.TagQuote);
        if (n > 0) stream.write(bytes);
        stream.write(HproseTags.TagQuote);
    }
    function writeBytesWithRef(bytes) {
        if (!refer.write(bytes)) writeBytes(bytes);
    }
    function writeUTF8Char(c) {
        stream.write(HproseTags.TagUTF8Char);
        stream.write(c);
    }
    function writeString(str) {
        refer.set(str);
        var n = str.length;
        stream.write(HproseTags.TagString);
        if (n > 0) stream.write('' + n);
        stream.write(HproseTags.TagQuote);
        if (n > 0) stream.write(str);
        stream.write(HproseTags.TagQuote);
    }
    function writeStringWithRef(str) {
        if (!refer.write(str)) writeString(str);
    }
    function writeArray(a, writeElem) {
        refer.set(a);
        var n = a.length;
        stream.write(HproseTags.TagList);
        if (n > 0) stream.write('' + n);
        stream.write(HproseTags.TagOpenbrace);
        for (var i = 0; i < n; i++) {
            writeElem(a[i]);
        }
        stream.write(HproseTags.TagClosebrace);
    }
    function writeList(list) {
        writeArray(list, serialize);
    }
    function writeListWithRef(list) {
        if (!refer.write(list)) writeList(list);
    }
    function writeIntList(list) {
        writeArray(list, writeInteger);
    }
    function writeIntListWithRef(list) {
        if (!refer.write(list)) writeIntList(list);
    }
    function writeDoubleList(list) {
        writeArray(list, writeDouble);
    }
    function writeDoubleListWithRef(list) {
        if (!refer.write(list)) writeDoubleList(list);
    }
    function writeMap(map) {
        refer.set(map);
        var fields = [];
        for (var key in map) {
            if (map.hasOwnProperty(key) &&
                typeof(map[key]) !== 'function') {
                fields[fields.length] = key;
            }
        }
        var n = fields.length;
        stream.write(HproseTags.TagMap);
        if (n > 0) stream.write('' + n);
        stream.write(HproseTags.TagOpenbrace);
        for (var i = 0; i < n; i++) {
            serialize(fields[i]);
            serialize(map[fields[i]]);
        }
        stream.write(HproseTags.TagClosebrace);
    }
    function writeMapWithRef(map) {
        if (!refer.write(map)) writeMap(map);
    }
    function writeHarmonyMap(map) {
        refer.set(map);
        var n = map.size;
        stream.write(HproseTags.TagMap);
        if (n > 0) stream.write('' + n);
        stream.write(HproseTags.TagOpenbrace);
        map.forEach(function(value, key) {
            serialize(key);
            serialize(value);
        });
        stream.write(HproseTags.TagClosebrace);
    }
    function writeHarmonyMapWithRef(map) {
        if (!refer.write(map)) writeHarmonyMap(map);
    }
    function writeObject(obj) {
        var classname = getClassName(obj);
        var fields;
        var index = classref[classname];
        if (index >= 0) {
            fields = fieldsref[index];
        }
        else {
            fields = [];
            for (var key in obj) {
                if (obj.hasOwnProperty(key) &&
                    typeof(obj[key]) !== 'function') {
                    fields[fields.length] = key.toString();
                }
            }
            index = writeClass(classname, fields);
        }
        stream.write(HproseTags.TagObject);
        stream.write('' + index);
        stream.write(HproseTags.TagOpenbrace);
        refer.set(obj);
        var count = fields.length;
        for (var i = 0; i < count; i++) {
            serialize(obj[fields[i]]);
        }
        stream.write(HproseTags.TagClosebrace);
    }
    function writeObjectWithRef(obj) {
        if (!refer.write(obj)) writeObject(obj);
    }
    function writeClass(classname, fields) {
        var n = fields.length;
        stream.write(HproseTags.TagClass);
        stream.write('' + classname.length);
        stream.write(HproseTags.TagQuote);
        stream.write(classname);
        stream.write(HproseTags.TagQuote);
        if (n > 0) stream.write('' + n);
        stream.write(HproseTags.TagOpenbrace);
        for (var i = 0; i < n; i++) {
            writeString(fields[i]);
        }
        stream.write(HproseTags.TagClosebrace);
        var index = fieldsref.length;
        classref[classname] = index;
        fieldsref[index] = fields;
        return index;
    }
    function reset() {
        classref = Object.create(null);
        fieldsref.length = 0;
        refer.reset();
    }
    this.stream = stream;
    this.serialize = serialize;
    this.writeInteger = writeInteger;
    this.writeDouble = writeDouble;
    this.writeBoolean = writeBoolean;
    this.writeUTCDate = writeUTCDate;
    this.writeUTCDateWithRef = writeUTCDateWithRef;
    this.writeDate = writeDate;
    this.writeDateWithRef = writeDateWithRef;
    this.writeTime = writeTime;
    this.writeTimeWithRef = writeTimeWithRef;
    this.writeBytes = writeBytes;
    this.writeBytesWithRef = writeBytesWithRef;
    this.writeUTF8Char = writeUTF8Char;
    this.writeString = writeString;
    this.writeStringWithRef = writeStringWithRef;
    this.writeList = writeList;
    this.writeListWithRef = writeListWithRef;
    this.writeMap = writeMap;
    this.writeMapWithRef = writeMapWithRef;
    this.writeHarmonyMap = writeHarmonyMap;
    this.writeHarmonyMapWithRef = writeHarmonyMapWithRef;
    this.writeObject = writeObject;
    this.writeObjectWithRef = writeObjectWithRef;
    this.reset = reset;
}

module.exports = HproseWriter;