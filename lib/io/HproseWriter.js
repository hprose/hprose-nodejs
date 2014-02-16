/**********************************************************\
|                                                          |
|                          hprose                          |
|                                                          |
| Official WebSite: http://www.hprose.com/                 |
|                   http://www.hprose.net/                 |
|                   http://www.hprose.org/                 |
|                                                          |
\**********************************************************/

/**********************************************************\
 *                                                        *
 * HproseWriter.js                                        *
 *                                                        *
 * HproseWriter for Node.js.                              *
 *                                                        *
 * LastModified: Feb 17, 2014                             *
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

function isDigit(value) {
    switch (value) {
    case 0:
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
    case 8:
    case 9:
        return true;
    }
    return false;
}

function isInt32(value) {
    return (value >= -2147483648) &&
           (value <= 2147483647) &&
           (Math.floor(value) === value);
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
    set: function (val) {},
    write: function (stream, val) { return false; },
    reset: function () {}
};

var realWriterRefer = function () {
    var ref = new Map();
    var refcount = 0;
    return {
        set: function (val) {
            ref.set(val, refcount++);
        },
        write: function (stream, val) {
            var index = ref.get(val);
            if (index !== undefined) {
                stream.write(HproseTags.TagRef);
                stream.write(index.toString());
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
    var refer = (simple ? fakeWriterRefer : realWriterRefer());
    function serialize(variable) {
        if (variable === undefined ||
            variable === null ||
            typeof(variable) === 'function') {
            writeNull();
            return;
        }
        if (variable === '') {
            writeEmpty();
            return;
        }
        switch (typeof(variable)) {
        case 'boolean':
            writeBoolean(variable);
            break;
        case 'number':
            writeNumber(variable);
            break;
        case 'string':
            if (variable.length === 1) {
                writeUTF8Char(variable);
            }
            else {
                writeStringWithRef(variable);
            }
            break;
        default:
            if (util.isDate(variable)) {
                writeDateWithRef(variable);
            }
            else if (util.isArray(variable)) {
                writeListWithRef(variable);
            }
            else if (Buffer.isBuffer(variable)) {
                writeBytesWithRef(variable);
            }
            else {
                var classname = getClassName(variable);
                if (classname === 'Object') {
                    writeMapWithRef(variable);
                }
                else {
                    writeObjectWithRef(variable);
                }
            }
            break;
        }
    }
    function writeNumber(n) {
        if (isDigit(n)) {
            stream.write(n + 0x30);
        }
        else if (isInt32(n)) {
            writeInteger(n);
        }
        else {
            writeDouble(n);
        }
    }
    function writeInteger(i) {
        stream.write(HproseTags.TagInteger);
        stream.write(i.toString());
        stream.write(HproseTags.TagSemicolon);
    }
    function writeLong(l) {
        stream.write(HproseTags.TagLong);
        stream.write(l.toString());
        stream.write(HproseTags.TagSemicolon);
    }
    function writeDouble(d) {
        if (isNaN(d)) {
            writeNaN();
        }
        else if (isFinite(d)) {
            stream.write(HproseTags.TagDouble);
            stream.write(d.toString());
            stream.write(HproseTags.TagSemicolon);
        }
        else {
            writeInfinity(d > 0);
        }
    }
    function writeNaN() {
        stream.write(HproseTags.TagNaN);
    }
    function writeInfinity(positive) {
        stream.write(HproseTags.TagInfinity);
        stream.write(positive ? HproseTags.TagPos : HproseTags.TagNeg);
    }
    function writeNull() {
        stream.write(HproseTags.TagNull);
    }
    function writeEmpty() {
        stream.write(HproseTags.TagEmpty);
    }
    function writeBoolean(b) {
        stream.write(b ? HproseTags.TagTrue : HproseTags.TagFalse);
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
        if (!refer.write(stream, date)) writeUTCDate(date);
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
        if (!refer.write(stream, date)) writeDate(date);
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
        if (!refer.write(stream, time)) writeTime(time);
    }
    function writeBytes(bytes) {
        refer.set(bytes);
        stream.write(HproseTags.TagBytes);
        if (bytes.length > 0) stream.write(bytes.length.toString());
        stream.write(HproseTags.TagQuote);
        if (bytes.length > 0) stream.write(bytes);
        stream.write(HproseTags.TagQuote);
    }
    function writeBytesWithRef(bytes) {
        if (!refer.write(stream, bytes)) writeBytes(bytes);
    }
    function writeUTF8Char(c) {
        stream.write(HproseTags.TagUTF8Char);
        stream.write(c);
    }
    function writeString(str) {
        refer.set(str);
        var length = str.length;
        stream.write(HproseTags.TagString);
        if (length > 0) stream.write(length.toString());
        stream.write(HproseTags.TagQuote);
        if (length > 0) stream.write(str);
        stream.write(HproseTags.TagQuote);
    }
    function writeStringWithRef(str) {
        if (!refer.write(stream, str)) writeString(str);
    }
    function writeList(list) {
        refer.set(list);
        var count = list.length;
        stream.write(HproseTags.TagList);
        if (count > 0) stream.write(count.toString());
        stream.write(HproseTags.TagOpenbrace);
        for (var i = 0; i < count; i++) {
            serialize(list[i]);
        }
        stream.write(HproseTags.TagClosebrace);
    }
    function writeListWithRef(list) {
        if (!refer.write(stream, list)) writeList(list);
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
        var count = fields.length;
        stream.write(HproseTags.TagMap);
        if (count > 0) stream.write(count.toString());
        stream.write(HproseTags.TagOpenbrace);
        for (var i = 0; i < count; i++) {
            serialize(fields[i]);
            serialize(map[fields[i]]);
        }
        stream.write(HproseTags.TagClosebrace);
    }
    function writeMapWithRef(map) {
        if (!refer.write(stream, map)) writeMap(map);
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
        stream.write(index.toString());
        stream.write(HproseTags.TagOpenbrace);
        refer.set(obj);
        var count = fields.length;
        for (var i = 0; i < count; i++) {
            serialize(obj[fields[i]]);
        }
        stream.write(HproseTags.TagClosebrace);
    }
    function writeObjectWithRef(obj) {
        if (!refer.write(stream, obj)) writeObject(obj);
    }
    function writeClass(classname, fields) {
        var count = fields.length;
        stream.write(HproseTags.TagClass);
        stream.write(classname.length.toString());
        stream.write(HproseTags.TagQuote);
        stream.write(classname);
        stream.write(HproseTags.TagQuote);
        if (count > 0) stream.write(count.toString());
        stream.write(HproseTags.TagOpenbrace);
        for (var i = 0; i < count; i++) {
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
    this.writeLong = writeLong;
    this.writeDouble = writeDouble;
    this.writeNaN = writeNaN;
    this.writeInfinity = writeInfinity;
    this.writeNull = writeNull;
    this.writeEmpty = writeEmpty;
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
    this.writeObject = writeObject;
    this.writeObjectWithRef = writeObjectWithRef;
    this.reset = reset;
}

module.exports = HproseWriter;