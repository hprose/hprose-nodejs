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
 * hprose/io/Reader.js                                    *
 *                                                        *
 * Hprose Reader for Node.js.                             *
 *                                                        *
 * LastModified: Aug 3, 2015                              *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
/*jshint unused:false */
'use strict';

var Map = global.Map;
var BytesIO = global.hprose.BytesIO;
var Tags = global.hprose.Tags;
var ClassManager = global.hprose.ClassManager;

function unexpectedTag(tag, expectTags) {
    if (tag && expectTags) {
        var expectTagStr = '';
        if (typeof(expectTags) === 'number') {
            expectTagStr = String.fromCharCode(expectTags);
        }
        else {
            expectTagStr = String.fromCharCode.apply(String, expectTags);
        }
        throw new Error('Tag "' + expectTagStr + '" expected, but "' + String.fromCharCode(tag) + '" found in stream');
    }
    else if (tag) {
        throw new Error('Unexpected serialize tag "' + String.fromCharCode(tag) + '" in stream');
    }
    else {
        throw new Error('No byte found in stream');
    }
}

function readRaw(stream) {
    var ostream = new BytesIO();
    _readRaw(stream, ostream);
    return ostream.bytes;
}

function _readRaw(stream, ostream) {
    __readRaw(stream, ostream, stream.readByte());
}

function __readRaw(stream, ostream, tag) {
    ostream.writeByte(tag);
    switch (tag) {
        case 48:
        case 49:
        case 50:
        case 51:
        case 52:
        case 53:
        case 54:
        case 55:
        case 56:
        case 57:
        case Tags.TagNull:
        case Tags.TagEmpty:
        case Tags.TagTrue:
        case Tags.TagFalse:
        case Tags.TagNaN:
            break;
        case Tags.TagInfinity:
            ostream.writeByte(stream.readByte());
            break;
        case Tags.TagInteger:
        case Tags.TagLong:
        case Tags.TagDouble:
        case Tags.TagRef:
            readNumberRaw(stream, ostream);
            break;
        case Tags.TagDate:
        case Tags.TagTime:
            readDateTimeRaw(stream, ostream);
            break;
        case Tags.TagUTF8Char:
            readUTF8CharRaw(stream, ostream);
            break;
        case Tags.TagBytes:
            readBytesRaw(stream, ostream);
            break;
        case Tags.TagString:
            readStringRaw(stream, ostream);
            break;
        case Tags.TagGuid:
            readGuidRaw(stream, ostream);
            break;
        case Tags.TagList:
        case Tags.TagMap:
        case Tags.TagObject:
            readComplexRaw(stream, ostream);
            break;
        case Tags.TagClass:
            readComplexRaw(stream, ostream);
            _readRaw(stream, ostream);
            break;
        case Tags.TagError:
            _readRaw(stream, ostream);
            break;
        default: unexpectedTag(tag);
    }
}
function readNumberRaw(stream, ostream) {
    var tag;
    do {
        tag = stream.readByte();
        ostream.writeByte(tag);
    } while (tag !== Tags.TagSemicolon);
}
function readDateTimeRaw(stream, ostream) {
    var tag;
    do {
        tag = stream.readByte();
        ostream.writeByte(tag);
    } while (tag !== Tags.TagSemicolon &&
             tag !== Tags.TagUTC);
}
function readUTF8CharRaw(stream, ostream) {
    ostream.writeString(stream.readString(1));
}
function readBytesRaw(stream, ostream) {
    var count = 0;
    var tag = 48;
    do {
        count *= 10;
        count += tag - 48;
        tag = stream.readByte();
        ostream.writeByte(tag);
    } while (tag !== Tags.TagQuote);
    ostream.write(stream.read(count + 1));
}
function readStringRaw(stream, ostream) {
    var count = 0;
    var tag = 48;
    do {
        count *= 10;
        count += tag - 48;
        tag = stream.readByte();
        ostream.writeByte(tag);
    } while (tag !== Tags.TagQuote);
    ostream.write(stream.readStringAsBytes(count + 1));
}
function readGuidRaw(stream, ostream) {
    ostream.write(stream.read(38));
}
function readComplexRaw(stream, ostream) {
    var tag;
    do {
        tag = stream.readByte();
        ostream.writeByte(tag);
    } while (tag !== Tags.TagOpenbrace);
    while ((tag = stream.readByte()) !== Tags.TagClosebrace) {
        __readRaw(stream, ostream, tag);
    }
    ostream.writeByte(tag);
}

function RawReader(stream) {
    Object.defineProperties(this, {
        stream: { value : stream },
        readRaw: { value: function() { return readRaw(stream); } }
    });
}

global.hprose.RawReader = RawReader;

var fakeReaderRefer = Object.create(null, {
    set: { value: function() {} },
    read: { value: function() { unexpectedTag(Tags.TagRef); } },
    reset: { value: function() {} }
});

function RealReaderRefer() {
    Object.defineProperties(this, {
        ref: { value: [] }
    });
}

Object.defineProperties(RealReaderRefer.prototype, {
    set: { value: function(val) { this.ref[this.ref.length] = val; } },
    read: { value: function(index) { return this.ref[index]; } },
    reset: { value: function() { this.ref.length = 0; } }
});

function realReaderRefer() {
    return new RealReaderRefer();
}

function getter(str) {
    var obj = global;
    var names = str.split('.');
    var i;
    for (i = 0; i < names.length; i++) {
        obj = obj[names[i]];
        if (obj === undefined) {
            return null;
        }
    }
    return obj;
}
function findClass(cn, poslist, i, c) {
    if (i < poslist.length) {
        var pos = poslist[i];
        cn[pos] = c;
        var cls = findClass(cn, poslist, i + 1, '.');
        if (i + 1 < poslist.length) {
            if (cls === null) {
                cls = findClass(cn, poslist, i + 1, '_');
            }
        }
        return cls;
    }
    var classname = cn.join('');
    try {
        var cl = getter(classname);
        return ((typeof(cl) === 'function') ? cl : null);
    } catch (e) {
        return null;
    }
}
function getClass(classname) {
    var cls = ClassManager.getClass(classname);
    if (cls) { return cls; }
    cls = getter(classname);
    if (typeof(cls) === 'function') {
        ClassManager.register(cls, classname);
        return cls;
    }
    var poslist = [];
    var pos = classname.indexOf('_');
    while (pos >= 0) {
        poslist[poslist.length] = pos;
        pos = classname.indexOf('_', pos + 1);
    }
    if (poslist.length > 0) {
        var cn = classname.split('');
        cls = findClass(cn, poslist, 0, '.');
        if (cls === null) {
            cls = findClass(cn, poslist, 0, '_');
        }
        if (typeof(cls) === 'function') {
            ClassManager.register(cls, classname);
            return cls;
        }
    }
    cls = function () {};
    Object.defineProperty(cls.prototype, 'getClassName', { value: function () {
        return classname;
    }});
    ClassManager.register(cls, classname);
    return cls;
}

function readInt(stream, tag) {
    var s = stream.readUntil(tag);
    if (s.length === 0) return 0;
    return parseInt(s, 10);
}
function unserialize(reader) {
    var stream = reader.stream;
    var tag = stream.readByte();
    switch (tag) {
        case 48:
        case 49:
        case 50:
        case 51:
        case 52:
        case 53:
        case 54:
        case 55:
        case 56:
        case 57: return tag - 48;
        case Tags.TagInteger: return readIntegerWithoutTag(stream);
        case Tags.TagLong: return readLongWithoutTag(stream);
        case Tags.TagDouble: return readDoubleWithoutTag(stream);
        case Tags.TagNull: return null;
        case Tags.TagEmpty: return '';
        case Tags.TagTrue: return true;
        case Tags.TagFalse: return false;
        case Tags.TagNaN: return NaN;
        case Tags.TagInfinity: return readInfinityWithoutTag(stream);
        case Tags.TagDate: return readDateWithoutTag(reader);
        case Tags.TagTime: return readTimeWithoutTag(reader);
        case Tags.TagBytes: return readBytesWithoutTag(reader);
        case Tags.TagUTF8Char: return readUTF8CharWithoutTag(reader);
        case Tags.TagString: return readStringWithoutTag(reader);
        case Tags.TagGuid: return readGuidWithoutTag(reader);
        case Tags.TagList: return readListWithoutTag(reader);
        case Tags.TagMap: return reader.useHarmonyMap ? readHarmonyMapWithoutTag(reader) : readMapWithoutTag(reader);
        case Tags.TagClass: readClass(reader); return readObject(reader);
        case Tags.TagObject: return readObjectWithoutTag(reader);
        case Tags.TagRef: return readRef(reader);
        case Tags.TagError: throw new Error(readString(reader));
        default: unexpectedTag(tag);
    }
}
function readIntegerWithoutTag(stream) {
    return readInt(stream, Tags.TagSemicolon);
}
function readInteger(stream) {
    var tag = stream.readByte();
    switch (tag) {
        case 48:
        case 49:
        case 50:
        case 51:
        case 52:
        case 53:
        case 54:
        case 55:
        case 56:
        case 57: return tag - 48;
        case Tags.TagInteger: return readIntegerWithoutTag(stream);
        default: unexpectedTag(tag);
    }
}
function readLongWithoutTag(stream) {
    var s = stream.readUntil(Tags.TagSemicolon);
    var l = parseInt(s, 10);
    if (l.toString() === s) return l;
    return s;
}
function readLong(stream) {
    var tag = stream.readByte();
    switch (tag) {
        case 48:
        case 49:
        case 50:
        case 51:
        case 52:
        case 53:
        case 54:
        case 55:
        case 56:
        case 57: return tag - 48;
        case Tags.TagInteger:
        case Tags.TagLong: return readLongWithoutTag(stream);
        default: unexpectedTag(tag);
    }
}
function readDoubleWithoutTag(stream) {
    return parseFloat(stream.readUntil(Tags.TagSemicolon));
}
function readDouble(stream) {
    var tag = stream.readByte();
    switch (tag) {
        case 48:
        case 49:
        case 50:
        case 51:
        case 52:
        case 53:
        case 54:
        case 55:
        case 56:
        case 57: return tag - 48;
        case Tags.TagInteger:
        case Tags.TagLong:
        case Tags.TagDouble: return readDoubleWithoutTag(stream);
        case Tags.TagNaN: return NaN;
        case Tags.TagInfinity: return readInfinityWithoutTag(stream);
        default: unexpectedTag(tag);
    }
}
function readInfinityWithoutTag(stream) {
    return ((stream.readByte() === Tags.TagNeg) ? -Infinity : Infinity);
}
function readBoolean(stream) {
    var tag = stream.readByte();
    switch (tag) {
        case Tags.TagTrue: return true;
        case Tags.TagFalse: return false;
        default: unexpectedTag(tag);
    }
}
function readDateWithoutTag(reader) {
    var stream = reader.stream;
    var year = parseInt(stream.readAsciiString(4), 10);
    var month = parseInt(stream.readAsciiString(2), 10) - 1;
    var day = parseInt(stream.readAsciiString(2), 10);
    var date;
    var tag = stream.readByte();
    if (tag === Tags.TagTime) {
        var hour = parseInt(stream.readAsciiString(2), 10);
        var minute = parseInt(stream.readAsciiString(2), 10);
        var second = parseInt(stream.readAsciiString(2), 10);
        var millisecond = 0;
        tag = stream.readByte();
        if (tag === Tags.TagPoint) {
            millisecond = parseInt(stream.readAsciiString(3), 10);
            tag = stream.readByte();
            if ((tag >= 48) && (tag <= 57)) {
                stream.skip(2);
                tag = stream.readByte();
                if ((tag >= 48) && (tag <= 57)) {
                    stream.skip(2);
                    tag = stream.readByte();
                }
            }
        }
        if (tag === Tags.TagUTC) {
            date = new Date(Date.UTC(year, month, day, hour, minute, second, millisecond));
        }
        else {
            date = new Date(year, month, day, hour, minute, second, millisecond);
        }
    }
    else if (tag === Tags.TagUTC) {
        date = new Date(Date.UTC(year, month, day));
    }
    else {
        date = new Date(year, month, day);
    }
    reader.refer.set(date);
    return date;
}
function readDate(reader) {
    var tag = reader.stream.readByte();
    switch (tag) {
        case Tags.TagNull: return null;
        case Tags.TagDate: return readDateWithoutTag(reader);
        case Tags.TagRef: return readRef(reader);
        default: unexpectedTag(tag);
    }
}
function readTimeWithoutTag(reader) {
    var stream = reader.stream;
    var time;
    var hour = parseInt(stream.readAsciiString(2), 10);
    var minute = parseInt(stream.readAsciiString(2), 10);
    var second = parseInt(stream.readAsciiString(2), 10);
    var millisecond = 0;
    var tag = stream.readByte();
    if (tag === Tags.TagPoint) {
        millisecond = parseInt(stream.readAsciiString(3), 10);
        tag = stream.readByte();
        if ((tag >= 48) && (tag <= 57)) {
            stream.skip(2);
            tag = stream.readByte();
            if ((tag >= 48) && (tag <= 57)) {
                stream.skip(2);
                tag = stream.readByte();
            }
        }
    }
    if (tag === Tags.TagUTC) {
        time = new Date(Date.UTC(1970, 0, 1, hour, minute, second, millisecond));
    }
    else {
        time = new Date(1970, 0, 1, hour, minute, second, millisecond);
    }
    reader.refer.set(time);
    return time;
}
function readTime(reader) {
    var tag = reader.stream.readByte();
    switch (tag) {
        case Tags.TagNull: return null;
        case Tags.TagTime: return readTimeWithoutTag(reader);
        case Tags.TagRef: return readRef(reader);
        default: unexpectedTag(tag);
    }
}
function readBytesWithoutTag(reader) {
    var stream = reader.stream;
    var count = readInt(stream, Tags.TagQuote);
    var bytes = stream.read(count);
    stream.skip(1);
    reader.refer.set(bytes);
    return bytes;
}
function readBytes(reader) {
    var tag = reader.stream.readByte();
    switch (tag) {
        case Tags.TagNull: return null;
        case Tags.TagEmpty: return new Uint8Array(0);
        case Tags.TagBytes: return readBytesWithoutTag(reader);
        case Tags.TagRef: return readRef(reader);
        default: unexpectedTag(tag);
    }
}
function readUTF8CharWithoutTag(reader) {
    return reader.stream.readString(1);
}
function _readString(reader) {
    var stream = reader.stream;
    var s = stream.readString(readInt(stream, Tags.TagQuote));
    stream.skip(1);
    return s;
}
function readStringWithoutTag(reader) {
    var s = _readString(reader);
    reader.refer.set(s);
    return s;
}
function readString(reader) {
    var tag = reader.stream.readByte();
    switch (tag) {
        case Tags.TagNull: return null;
        case Tags.TagEmpty: return '';
        case Tags.TagUTF8Char: return readUTF8CharWithoutTag(reader);
        case Tags.TagString: return readStringWithoutTag(reader);
        case Tags.TagRef: return readRef(reader);
        default: unexpectedTag(tag);
    }
}
function readGuidWithoutTag(reader) {
    var stream = reader.stream;
    stream.skip(1);
    var s = stream.readAsciiString(36);
    stream.skip(1);
    reader.refer.set(s);
    return s;
}
function readGuid(reader) {
    var tag = reader.stream.readByte();
    switch (tag) {
        case Tags.TagNull: return null;
        case Tags.TagGuid: return readGuidWithoutTag(reader);
        case Tags.TagRef: return readRef(reader);
        default: unexpectedTag(tag);
    }
}
function readListWithoutTag(reader) {
    var stream = reader.stream;
    var list = [];
    reader.refer.set(list);
    var count = readInt(stream, Tags.TagOpenbrace);
    for (var i = 0; i < count; i++) {
        list[i] = unserialize(reader);
    }
    stream.skip(1);
    return list;
}
function readList(reader) {
    var tag = reader.stream.readByte();
    switch (tag) {
        case Tags.TagNull: return null;
        case Tags.TagList: return readListWithoutTag(reader);
        case Tags.TagRef: return readRef(reader);
        default: unexpectedTag(tag);
    }
}
function readMapWithoutTag(reader) {
    var stream = reader.stream;
    var map = {};
    reader.refer.set(map);
    var count = readInt(stream, Tags.TagOpenbrace);
    for (var i = 0; i < count; i++) {
        var key = unserialize(reader);
        var value = unserialize(reader);
        map[key] = value;
    }
    stream.skip(1);
    return map;
}
function readMap(reader) {
    var tag = reader.stream.readByte();
    switch (tag) {
        case Tags.TagNull: return null;
        case Tags.TagMap: return readMapWithoutTag(reader);
        case Tags.TagRef: return readRef(reader);
        default: unexpectedTag(tag);
    }
}
function readHarmonyMapWithoutTag(reader) {
    var stream = reader.stream;
    var map = new Map();
    reader.refer.set(map);
    var count = readInt(stream, Tags.TagOpenbrace);
    for (var i = 0; i < count; i++) {
        var key = unserialize(reader);
        var value = unserialize(reader);
        map.set(key, value);
    }
    stream.skip(1);
    return map;
}
function readHarmonyMap(reader) {
    var tag = reader.stream.readByte();
    switch (tag) {
        case Tags.TagNull: return null;
        case Tags.TagMap: return readHarmonyMapWithoutTag(reader);
        case Tags.TagRef: return readRef(reader);
        default: unexpectedTag(tag);
    }
}
function readObjectWithoutTag(reader) {
    var stream = reader.stream;
    var cls = reader.classref[readInt(stream, Tags.TagOpenbrace)];
    var obj = new cls.classname();
    reader.refer.set(obj);
    for (var i = 0; i < cls.count; i++) {
        obj[cls.fields[i]] = unserialize(reader);
    }
    stream.skip(1);
    return obj;
}
function readObject(reader) {
    var tag = reader.stream.readByte();
    switch(tag) {
        case Tags.TagNull: return null;
        case Tags.TagClass: readClass(reader); return readObject(reader);
        case Tags.TagObject: return readObjectWithoutTag(reader);
        case Tags.TagRef: return readRef(reader);
        default: unexpectedTag(tag);
    }
}
function readClass(reader) {
    var stream = reader.stream;
    var classname = _readString(reader);
    var count = readInt(stream, Tags.TagOpenbrace);
    var fields = [];
    for (var i = 0; i < count; i++) {
        fields[i] = readString(reader);
    }
    stream.skip(1);
    classname = getClass(classname);
    reader.classref.push({
        classname: classname,
        count: count,
        fields: fields
    });
}
function readRef(reader) {
    return reader.refer.read(readInt(reader.stream, Tags.TagSemicolon));
}

function Reader(stream, simple, useHarmonyMap) {
    RawReader.call(this, stream);
    this.useHarmonyMap = !!useHarmonyMap;
    Object.defineProperties(this, {
        classref: { value: [] },
        refer: { value: simple ? fakeReaderRefer : realReaderRefer() }
    });
}

Reader.prototype = Object.create(RawReader.prototype);
Reader.prototype.constructor = Reader;

Object.defineProperties(Reader.prototype, {
    useHarmonyMap: { value: false, writable: true },
    checkTag: { value: function(expectTag, tag) {
        if (tag === undefined) tag = this.stream.readByte();
        if (tag !== expectTag) unexpectedTag(tag, expectTag);
    } },
    checkTags: { value: function(expectTags, tag) {
        if (tag === undefined) tag = this.stream.readByte();
        if (expectTags.indexOf(tag) >= 0) return tag;
        unexpectedTag(tag, expectTags);
    } },
    unserialize: { value: function() {
        return unserialize(this);
    } },
    readInteger: { value: function() {
        return readInteger(this.stream);
    } },
    readLong: { value: function() {
        return readLong(this.stream);
    } },
    readDouble: { value: function() {
        return readDouble(this.stream);
    } },
    readBoolean: { value: function() {
        return readBoolean(this.stream);
    } },
    readDateWithoutTag: { value: function() {
        return readDateWithoutTag(this);
    } },
    readDate: { value: function() {
        return readDate(this);
    } },
    readTimeWithoutTag: { value: function() {
        return readTimeWithoutTag(this);
    } },
    readTime: { value: function() {
        return readTime(this);
    } },
    readBytesWithoutTag: { value: function() {
        return readBytesWithoutTag(this);
    } },
    readBytes: { value: function() {
        return readBytes(this);
    } },
    readStringWithoutTag: { value: function() {
        return readStringWithoutTag(this);
    } },
    readString: { value: function() {
        return readString(this);
    } },
    readGuidWithoutTag: { value: function() {
        return readGuidWithoutTag(this);
    } },
    readGuid: { value: function() {
        return readGuid(this);
    } },
    readListWithoutTag: { value: function() {
        return readListWithoutTag(this);
    } },
    readList: { value: function() {
        return readList(this);
    } },
    readMapWithoutTag: { value: function() {
        return this.useHarmonyMap ?
               readHarmonyMapWithoutTag(this) :
               readMapWithoutTag(this);
    } },
    readMap: { value: function() {
        return this.useHarmonyMap ?
               readHarmonyMap(this) :
               readMap(this);
    } },
    readObjectWithoutTag: { value: function() {
        return readObjectWithoutTag(this);
    } },
    readObject: { value: function() {
        return readObject(this);
    } },
    reset: { value: function() {
        this.classref.length = 0;
        this.refer.reset();
    } }
});

global.hprose.Reader = Reader;
