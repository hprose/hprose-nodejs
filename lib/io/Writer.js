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
 * LastModified: Aug 2, 2015                              *
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

var fakeWriterRefer = Object.create(null, {
    set: { value: function () {} },
    write: { value: function () { return false; } },
    reset: { value: function () {} }
});

function RealWriterRefer(stream) {
    Object.defineProperties(this, {
        _stream: { value: stream },
        _ref: { value: new Map(), writable: true }
    });
}

Object.defineProperties(RealWriterRefer.prototype, {
    _refcount: { value: 0, writable: true },
    set: { value: function (val) {
        this._ref.set(val, this._refcount++);
    } },
    write: { value: function (val) {
        var index = this._ref.get(val);
        if (index !== undefined) {
            this._stream.writeByte(Tags.TagRef);
            this._stream.writeString('' + index);
            this._stream.writeByte(Tags.TagSemicolon);
            return true;
        }
        return false;
    } },
    reset: { value: function () {
        this._ref = new Map();
        this._refcount = 0;
    } }
});

function realWriterRefer(stream) {
    return new RealWriterRefer(stream);
}

function Writer(stream, simple) {
    Object.defineProperties(this, {
        stream: { value: stream },
        _classref: { value: Object.create(null), writable: true },
        _fieldsref: { value: [], writable: true },
        _refer: { value: simple ? fakeWriterRefer : realWriterRefer(stream) }
    });
}

function serialize(writer, value) {
    var stream = writer.stream;
    if (value === undefined || value === null) {
        stream.writeByte(Tags.TagNull);
        return;
    }
    switch (value.constructor) {
    case Function:
        stream.writeByte(Tags.TagNull);
        return;
    case Number:
        writeNumber(writer, value);
        return;
    case Boolean:
        writeBoolean(writer, value);
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
        writer.writeStringWithRef(value);
        return;
    case Date:
        writer.writeDateWithRef(value);
        return;
    case Map:
        writer.writeMapWithRef(value);
        return;
    case ArrayBuffer:
    case Uint8Array:
    case BytesIO:
        writer.writeBytesWithRef(value);
        return;
    case Int8Array:
    case Int16Array:
    case Int32Array:
    case Uint16Array:
    case Uint32Array:
        writeIntListWithRef(writer, value);
        return;
    case Float32Array:
    case Float64Array:
        writeDoubleListWithRef(writer, value);
        return;
    default:
        if (util.isArray(value)) {
            writer.writeListWithRef(value);
        }
        else if (util.isDate(value)) {
            writer.writeDateWithRef(value);
        }
        else if (Buffer.isBuffer(value)) {
            writer.writeBytesWithRef(value);
        }
        else {
            var classname = getClassName(value);
            if (classname === 'Object') {
                writer.writeMapWithRef(value);
            }
            else {
                writer.writeObjectWithRef(value);
            }
        }
        break;
    }
}

function writeNumber(writer, n) {
    var stream = writer.stream;
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

function writeInteger(writer, n) {
    var stream = writer.stream;
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

function writeDouble(writer, n) {
    var stream = writer.stream;
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

function writeBoolean(writer, b) {
    writer.stream.writeByte(b.valueOf() ? Tags.TagTrue : Tags.TagFalse);
}

function writeUTCDate(writer, date) {
    writer._refer.set(date);
    var stream = writer.stream;
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

function writeDate(writer, date) {
    writer._refer.set(date);
    var stream = writer.stream;
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

function writeTime(writer, time) {
    writer._refer.set(time);
    var stream = writer.stream;
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

function writeBytes(writer, bytes) {
    writer._refer.set(bytes);
    var stream = writer.stream;
    stream.writeByte(Tags.TagBytes);
    var n = bytes.byteLength || bytes.length;
    if (n > 0) stream.writeAsciiString('' + n);
    stream.writeByte(Tags.TagQuote);
    if (n > 0) stream.write(bytes);
    stream.writeByte(Tags.TagQuote);
}

function writeString(writer, str) {
    writer._refer.set(str);
    var stream = writer.stream;
    var n = str.length;
    stream.writeByte(Tags.TagString);
    if (n > 0) stream.writeAsciiString('' + n);
    stream.writeByte(Tags.TagQuote);
    if (n > 0) stream.writeString(str);
    stream.writeByte(Tags.TagQuote);
}

function writeArray(writer, array, writeElem) {
    writer._refer.set(array);
    var stream = writer.stream;
    var n = array.length;
    stream.writeByte(Tags.TagList);
    if (n > 0) stream.writeAsciiString('' + n);
    stream.writeByte(Tags.TagOpenbrace);
    for (var i = 0; i < n; i++) {
        writeElem(writer, array[i]);
    }
    stream.writeByte(Tags.TagClosebrace);
}

function writeIntListWithRef(writer, list) {
    if (!writer._refer.write(list)) {
        writeArray(writer, list, writeInteger);
    }
}

function writeDoubleListWithRef(writer, list) {
    if (!writer._refer.write(list)) {
        writeArray(writer, list, writeDouble);
    }
}

function writeMap(writer, map) {
    writer._refer.set(map);
    var stream = writer.stream;
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
        serialize(writer, fields[i]);
        serialize(writer, map[fields[i]]);
    }
    stream.writeByte(Tags.TagClosebrace);
}

function writeHarmonyMap(writer, map) {
    writer._refer.set(map);
    var stream = writer.stream;
    var n = map.size;
    stream.writeByte(Tags.TagMap);
    if (n > 0) stream.writeAsciiString('' + n);
    stream.writeByte(Tags.TagOpenbrace);
    map.forEach(function(value, key) {
        serialize(writer, key);
        serialize(writer, value);
    });
    stream.writeByte(Tags.TagClosebrace);
}

function writeObject(writer, obj) {
    var stream = writer.stream;
    var classname = getClassName(obj);
    var fields, index;
    if (classname in writer._classref) {
        index = writer._classref[classname];
        fields = writer._fieldsref[index];
    }
    else {
        fields = [];
        for (var key in obj) {
            if (obj.hasOwnProperty(key) &&
                typeof(obj[key]) !== 'function') {
                fields[fields.length] = key.toString();
            }
        }
        index = writeClass(writer, classname, fields);
    }
    stream.writeByte(Tags.TagObject);
    stream.writeAsciiString('' + index);
    stream.writeByte(Tags.TagOpenbrace);
    writer._refer.set(obj);
    var n = fields.length;
    for (var i = 0; i < n; i++) {
        serialize(writer, obj[fields[i]]);
    }
    stream.writeByte(Tags.TagClosebrace);
}

function writeClass(writer, classname, fields) {
    var stream = writer.stream;
    var n = fields.length;
    stream.writeByte(Tags.TagClass);
    stream.writeAsciiString('' + classname.length);
    stream.writeByte(Tags.TagQuote);
    stream.writeString(classname);
    stream.writeByte(Tags.TagQuote);
    if (n > 0) stream.writeAsciiString('' + n);
    stream.writeByte(Tags.TagOpenbrace);
    for (var i = 0; i < n; i++) {
        writeString(writer, fields[i]);
    }
    stream.writeByte(Tags.TagClosebrace);
    var index = writer._fieldsref.length;
    writer._classref[classname] = index;
    writer._fieldsref[index] = fields;
    return index;
}

Object.defineProperties(Writer.prototype, {
    serialize: { value: function(value) {
        serialize(this, value);
    } },
    writeInteger: { value: function(value) {
        writeInteger(this, value);
    } },
    writeDouble: { value: function(value) {
        writeDouble(this, value);
    } },
    writeBoolean: { value: function(value) {
        writeBoolean(this, value);
    } },
    writeUTCDate: { value: function(value) {
        writeUTCDate(this, value);
    } },
    writeUTCDateWithRef: { value: function(value) {
        if (!this._refer.write(value)) {
            writeUTCDate(this, value);
        }
    } },
    writeDate: { value: function(value) {
        writeDate(this, value);
    } },
    writeDateWithRef: { value: function(value) {
        if (!this._refer.write(value)) {
            writeDate(this, value);
        }
    } },
    writeTime: { value: function(value) {
        writeTime(this, value);
    } },
    writeTimeWithRef: { value: function(value) {
        if (!this._refer.write(value)) {
            writeTime(this, value);
        }
    } },
    writeBytes: { value: function(value) {
        writeBytes(this, value);
    } },
    writeBytesWithRef: { value: function(value) {
        if (!this._refer.write(value)) {
            writeBytes(this, value);
        }
    } },
    writeString: { value: function(value) {
        writeString(this, value);
    } },
    writeStringWithRef: { value: function(value) {
        if (!this._refer.write(value)) {
            writeString(this, value);
        }
    } },
    writeList: { value: function(value) {
        writeArray(this, value, serialize);
    } },
    writeListWithRef: { value: function(value) {
        if (!this._refer.write(value)) {
            writeArray(this, value, serialize);
        }
    } },
    writeMap: { value: function(value) {
        if (value instanceof Map) {
            writeHarmonyMap(this, value);
        }
        else {
            writeMap(this, value);
        }
    } },
    writeMapWithRef: { value: function(value) {
        if (!this._refer.write(value)) {
            if (value instanceof Map) {
                writeHarmonyMap(this, value);
            }
            else {
                writeMap(this, value);
            }
        }
    } },
    writeObject: { value: function(value) {
        writeObject(this, value);
    } },
    writeObjectWithRef: { value: function(value) {
        if (!this._refer.write(value)) {
            writeObject(this, value);
        }
    } },
    reset: { value: function() {
        this._classref = Object.create(null);
        this._fieldsref.length = 0;
        this._refer.reset();
    } }
});

global.hprose.Writer = Writer;
