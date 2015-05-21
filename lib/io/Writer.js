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
 * hprose/io/Writer.js                                    *
 *                                                        *
 * Hprose Writer for Node.js.                             *
 *                                                        *
 * LastModified: May 19, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true, unused:false */
'use strict';

var util = require('util');
var Map = global.Map;
var BytesIO = global.hprose.BytesIO;
var Tags = global.hprose.Tags;
var ClassManager = global.hprose.ClassManager;

function getClassName(obj) {
    var cls = obj.constructor;
    var classname = ClassManager.getClassAlias(cls);
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
        ClassManager.register(cls, classname);
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
                stream.writeByte(Tags.TagRef);
                stream.writeString('' + index);
                stream.writeByte(Tags.TagSemicolon);
                return true;
            }
            return false;
        },
        reset: function () {
            ref = new Map();
            refcount = 0;
        }
    };
};

function Writer(stream, simple) {
    var classref = Object.create(null);
    var fieldsref = [];
    var refer = simple ? fakeWriterRefer : realWriterRefer(stream);

    function serialize(value) {
        if (value === undefined || value === null) {
            stream.writeByte(Tags.TagNull);
            return;
        }
        switch (value.constructor) {
        case Function:
            stream.writeByte(Tags.TagNull);
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
                stream.writeByte(Tags.TagEmpty);
                return;
            case 1:
                stream.writeByte(Tags.TagUTF8Char);
                stream.writeString(value);
                return;
            }
            writeStringWithRef(value);
            return;
        case Date:
            writeDateWithRef(value);
            return;
        case Map:
            writeHarmonyMapWithRef(value);
            return;
        case ArrayBuffer:
        case Uint8Array:
        case BytesIO:
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
            if (util.isArray(value)) {
                writeListWithRef(value);
            }
            else if (util.isDate(value)) {
                writeDateWithRef(value);
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
        if (n === (n | 0)) {
            if (0 <= n && n <= 9) {
                stream.writeByte(n + 0x30);
            }
            else {
                stream.writeByte(Tags.TagInteger);
                stream.writeAsciiString('' + n);
                stream.writeByte(Tags.TagSemicolon);
            }
        }
        else if (isNaN(n)) {
            stream.writeByte(Tags.TagNaN);
        }
        else if (isFinite(n)) {
            stream.writeByte(Tags.TagDouble);
            stream.writeAsciiString('' + n);
            stream.writeByte(Tags.TagSemicolon);
        }
        else {
            stream.writeByte(Tags.TagInfinity);
            stream.writeByte((n > 0) ? Tags.TagPos : Tags.TagNeg);
        }
    }
    function writeInteger(n) {
        if (0 <= n && n <= 9) {
            stream.writeByte(n + 0x30);
        }
        else {
            if (n < -2147483648 || n > 2147483647) {
                stream.writeByte(Tags.TagLong);
            }
            else {
                stream.writeByte(Tags.TagInteger);
            }
            stream.writeAsciiString('' + n);
            stream.writeByte(Tags.TagSemicolon);
        }
    }
    function writeDouble(n) {
        if (isNaN(n)) {
            stream.writeByte(Tags.TagNaN);
        }
        else if (isFinite(n)) {
            stream.writeByte(Tags.TagDouble);
            stream.writeAsciiString('' + n);
            stream.writeByte(Tags.TagSemicolon);
        }
        else {
            stream.writeByte(Tags.TagInfinity);
            stream.writeByte((n > 0) ? Tags.TagPos : Tags.TagNeg);
        }
    }
    function writeBoolean(b) {
        stream.writeByte(b.valueOf() ? Tags.TagTrue : Tags.TagFalse);
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
        stream.writeByte(Tags.TagDate);
        stream.writeAsciiString(year + month + day);
        stream.writeByte(Tags.TagTime);
        stream.writeAsciiString(hour + minute + second);
        if (millisecond !== '000') {
            stream.writeByte(Tags.TagPoint);
            stream.writeAsciiString(millisecond);
        }
        stream.writeByte(Tags.TagUTC);
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
            stream.writeByte(Tags.TagDate);
            stream.writeAsciiString(year + month + day);
        }
        else if ((year === '1970') && (month === '01') && (day === '01')) {
            stream.writeByte(Tags.TagTime);
            stream.writeAsciiString(hour + minute + second);
            if (millisecond !== '000') {
                stream.writeByte(Tags.TagPoint);
                stream.writeAsciiString(millisecond);
            }
        }
        else {
            stream.writeByte(Tags.TagDate);
            stream.writeAsciiString(year + month + day);
            stream.writeByte(Tags.TagTime);
            stream.writeAsciiString(hour + minute + second);
            if (millisecond !== '000') {
                stream.writeByte(Tags.TagPoint);
                stream.writeAsciiString(millisecond);
            }
        }
        stream.writeByte(Tags.TagSemicolon);
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
        stream.writeByte(Tags.TagTime);
        stream.writeAsciiString(hour + minute + second);
        if (millisecond !== '000') {
            stream.writeByte(Tags.TagPoint);
            stream.writeAsciiString(millisecond);
        }
        stream.writeByte(Tags.TagSemicolon);
    }
    function writeTimeWithRef(time) {
        if (!refer.write(time)) writeTime(time);
    }
    function writeBytes(bytes) {
        refer.set(bytes);
        stream.writeByte(Tags.TagBytes);
        var n = bytes.byteLength || bytes.length;
        if (n > 0) stream.writeAsciiString('' + n);
        stream.writeByte(Tags.TagQuote);
        if (n > 0) stream.write(bytes);
        stream.writeByte(Tags.TagQuote);
    }
    function writeBytesWithRef(bytes) {
        if (!refer.write(bytes)) writeBytes(bytes);
    }
    function writeString(str) {
        refer.set(str);
        var n = str.length;
        stream.writeByte(Tags.TagString);
        if (n > 0) stream.writeAsciiString('' + n);
        stream.writeByte(Tags.TagQuote);
        if (n > 0) stream.writeString(str);
        stream.writeByte(Tags.TagQuote);
    }
    function writeStringWithRef(str) {
        if (!refer.write(str)) writeString(str);
    }
    function writeArray(a, writeElem) {
        refer.set(a);
        var n = a.length;
        stream.writeByte(Tags.TagList);
        if (n > 0) stream.writeAsciiString('' + n);
        stream.writeByte(Tags.TagOpenbrace);
        for (var i = 0; i < n; i++) {
            writeElem(a[i]);
        }
        stream.writeByte(Tags.TagClosebrace);
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
        stream.writeByte(Tags.TagMap);
        if (n > 0) stream.writeAsciiString('' + n);
        stream.writeByte(Tags.TagOpenbrace);
        for (var i = 0; i < n; i++) {
            serialize(fields[i]);
            serialize(map[fields[i]]);
        }
        stream.writeByte(Tags.TagClosebrace);
    }
    function writeMapWithRef(map) {
        if (!refer.write(map)) writeMap(map);
    }
    function writeHarmonyMap(map) {
        refer.set(map);
        var n = map.size;
        stream.writeByte(Tags.TagMap);
        if (n > 0) stream.writeAsciiString('' + n);
        stream.writeByte(Tags.TagOpenbrace);
        map.forEach(function(value, key) {
            serialize(key);
            serialize(value);
        });
        stream.writeByte(Tags.TagClosebrace);
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
        stream.writeByte(Tags.TagObject);
        stream.writeAsciiString('' + index);
        stream.writeByte(Tags.TagOpenbrace);
        refer.set(obj);
        var n = fields.length;
        for (var i = 0; i < n; i++) {
            serialize(obj[fields[i]]);
        }
        stream.writeByte(Tags.TagClosebrace);
    }
    function writeObjectWithRef(obj) {
        if (!refer.write(obj)) writeObject(obj);
    }
    function writeClass(classname, fields) {
        var n = fields.length;
        stream.writeByte(Tags.TagClass);
        stream.writeAsciiString('' + classname.length);
        stream.writeByte(Tags.TagQuote);
        stream.writeString(classname);
        stream.writeByte(Tags.TagQuote);
        if (n > 0) stream.writeAsciiString('' + n);
        stream.writeByte(Tags.TagOpenbrace);
        for (var i = 0; i < n; i++) {
            writeString(fields[i]);
        }
        stream.writeByte(Tags.TagClosebrace);
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
    Object.defineProperties(this, {
        stream: {
            get : function() { return stream; }
        },
        serialize: { value: serialize },
        writeInteger: { value: writeInteger },
        writeDouble: { value: writeDouble },
        writeBoolean: { value: writeBoolean },
        writeUTCDate: { value: writeUTCDate },
        writeUTCDateWithRef: { value: writeUTCDateWithRef },
        writeDate: { value: writeDate },
        writeDateWithRef: { value: writeDateWithRef },
        writeTime: { value: writeTime },
        writeTimeWithRef: { value: writeTimeWithRef },
        writeBytes: { value: writeBytes },
        writeBytesWithRef: { value: writeBytesWithRef },
        writeString: { value: writeString },
        writeStringWithRef: { value: writeStringWithRef },
        writeList: { value: writeList },
        writeListWithRef: { value: writeListWithRef },
        writeMap: { value: writeMap },
        writeMapWithRef: { value: writeMapWithRef },
        writeHarmonyMap: { value: writeHarmonyMap },
        writeHarmonyMapWithRef: { value: writeHarmonyMapWithRef },
        writeObject: { value: writeObject },
        writeObjectWithRef: { value: writeObjectWithRef },
        reset: { value: reset }
    });
}

global.hprose.Writer = Writer;
