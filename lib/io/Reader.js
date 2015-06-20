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
 * LastModified: Jun 20, 2015                             *
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

function RawReader(stream) {
    function readRaw() {
        var ostream = new BytesIO();
        _readRaw(ostream);
        return ostream.bytes;
    }
    function _readRaw(ostream) {
        __readRaw(ostream, stream.readByte());
    }
    function __readRaw(ostream, tag) {
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
                readNumberRaw(ostream);
                break;
            case Tags.TagDate:
            case Tags.TagTime:
                readDateTimeRaw(ostream);
                break;
            case Tags.TagUTF8Char:
                readUTF8CharRaw(ostream);
                break;
            case Tags.TagBytes:
                readBytesRaw(ostream);
                break;
            case Tags.TagString:
                readStringRaw(ostream);
                break;
            case Tags.TagGuid:
                readGuidRaw(ostream);
                break;
            case Tags.TagList:
            case Tags.TagMap:
            case Tags.TagObject:
                readComplexRaw(ostream);
                break;
            case Tags.TagClass:
                readComplexRaw(ostream);
                _readRaw(ostream);
                break;
            case Tags.TagError:
                _readRaw(ostream);
                break;
            default: unexpectedTag(tag);
        }
    }
    function readNumberRaw(ostream) {
        var tag;
        do {
            tag = stream.readByte();
            ostream.writeByte(tag);
        } while (tag !== Tags.TagSemicolon);
    }
    function readDateTimeRaw(ostream) {
        var tag;
        do {
            tag = stream.readByte();
            ostream.writeByte(tag);
        } while (tag !== Tags.TagSemicolon &&
                 tag !== Tags.TagUTC);
    }
    function readUTF8CharRaw(ostream) {
        ostream.writeString(stream.readString(1));
    }
    function readBytesRaw(ostream) {
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
    function readStringRaw(ostream) {
        var count = 0;
        var tag = 48;
        do {
            count *= 10;
            count += tag - 48;
            tag = stream.readByte();
            ostream.writeByte(tag);
        } while (tag !== Tags.TagQuote);
        ostream.writeString(stream.readString(count + 1));
    }
    function readGuidRaw(ostream) {
        ostream.write(stream.read(38));
    }
    function readComplexRaw(ostream) {
        var tag;
        do {
            tag = stream.readByte();
            ostream.writeByte(tag);
        } while (tag !== Tags.TagOpenbrace);
        while ((tag = stream.readByte()) !== Tags.TagClosebrace) {
            __readRaw(ostream, tag);
        }
        ostream.writeByte(tag);
    }
    Object.defineProperties(this, {
        stream: {
            get : function() { return stream; }
        },
        readRaw: { value: readRaw }
    });
}

global.hprose.RawReader = RawReader;

var fakeReaderRefer = {
    set: function () {},
    read: function () { unexpectedTag(Tags.TagRef); },
    reset: function () {}
};

function realReaderRefer() {
    var ref = [];
    return {
        set: function (val) {
            ref[ref.length] = val;
        },
        read: function (index) {
            return ref[index];
        },
        reset: function () {
            ref.length = 0;
        }
    };
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

function Reader(stream, simple, useHarmonyMap) {
    RawReader.call(this, stream);
    var classref = [];
    var refer = (simple ? fakeReaderRefer : realReaderRefer());
    function setUseHarmonyMap(value) {
        useHarmonyMap = !!value;
    }
    function getUseHarmonyMap() {
        return useHarmonyMap;
    }
    function checkTag(expectTag, tag) {
        if (tag === undefined) tag = stream.readByte();
        if (tag !== expectTag) unexpectedTag(tag, expectTag);
    }
    function checkTags(expectTags, tag) {
        if (tag === undefined) tag = stream.readByte();
        if (expectTags.indexOf(tag) >= 0) return tag;
        unexpectedTag(tag, expectTags);
    }
    function readInt(tag) {
        var s = stream.readUntil(tag);
        if (s.length === 0) return 0;
        return parseInt(s, 10);
    }
    function unserialize() {
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
            case Tags.TagInteger: return readIntegerWithoutTag();
            case Tags.TagLong: return readLongWithoutTag();
            case Tags.TagDouble: return readDoubleWithoutTag();
            case Tags.TagNull: return null;
            case Tags.TagEmpty: return '';
            case Tags.TagTrue: return true;
            case Tags.TagFalse: return false;
            case Tags.TagNaN: return NaN;
            case Tags.TagInfinity: return readInfinityWithoutTag();
            case Tags.TagDate: return readDateWithoutTag();
            case Tags.TagTime: return readTimeWithoutTag();
            case Tags.TagBytes: return readBytesWithoutTag();
            case Tags.TagUTF8Char: return readUTF8CharWithoutTag();
            case Tags.TagString: return readStringWithoutTag();
            case Tags.TagGuid: return readGuidWithoutTag();
            case Tags.TagList: return readListWithoutTag();
            case Tags.TagMap: return useHarmonyMap ? readHarmonyMapWithoutTag() : readMapWithoutTag();
            case Tags.TagClass: readClass(); return readObject();
            case Tags.TagObject: return readObjectWithoutTag();
            case Tags.TagRef: return readRef();
            case Tags.TagError: throw new Error(readString());
            default: unexpectedTag(tag);
        }
    }
    function readIntegerWithoutTag() {
        return readInt(Tags.TagSemicolon);
    }
    function readInteger() {
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
            case Tags.TagInteger: return readIntegerWithoutTag();
            default: unexpectedTag(tag);
        }
    }
    function readLongWithoutTag() {
        var s = stream.readUntil(Tags.TagSemicolon);
        var l = parseInt(s, 10);
        if (l.toString() === s) return l;
        return s;
    }
    function readLong() {
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
            case Tags.TagLong: return readLongWithoutTag();
            default: unexpectedTag(tag);
        }
    }
    function readDoubleWithoutTag() {
        return parseFloat(stream.readUntil(Tags.TagSemicolon));
    }
    function readDouble() {
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
            case Tags.TagDouble: return readDoubleWithoutTag();
            case Tags.TagNaN: return NaN;
            case Tags.TagInfinity: return readInfinityWithoutTag();
            default: unexpectedTag(tag);
        }
    }
    function readInfinityWithoutTag() {
        return ((stream.readByte() === Tags.TagNeg) ? -Infinity : Infinity);
    }
    function readBoolean() {
        var tag = stream.readByte();
        switch (tag) {
            case Tags.TagTrue: return true;
            case Tags.TagFalse: return false;
            default: unexpectedTag(tag);
        }
    }
    function readDateWithoutTag() {
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
        refer.set(date);
        return date;
    }
    function readDate() {
        var tag = stream.readByte();
        switch (tag) {
            case Tags.TagNull: return null;
            case Tags.TagDate: return readDateWithoutTag();
            case Tags.TagRef: return readRef();
            default: unexpectedTag(tag);
        }
    }
    function readTimeWithoutTag() {
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
        refer.set(time);
        return time;
    }
    function readTime() {
        var tag = stream.readByte();
        switch (tag) {
            case Tags.TagNull: return null;
            case Tags.TagTime: return readTimeWithoutTag();
            case Tags.TagRef: return readRef();
            default: unexpectedTag(tag);
        }
    }
    function readBytesWithoutTag() {
        var count = readInt(Tags.TagQuote);
        var bytes = stream.read(count);
        stream.skip(1);
        refer.set(bytes);
        return bytes;
    }
    function readBytes() {
        var tag = stream.readByte();
        switch (tag) {
            case Tags.TagNull: return null;
            case Tags.TagEmpty: return new Uint8Array(0);
            case Tags.TagBytes: return readBytesWithoutTag();
            case Tags.TagRef: return readRef();
            default: unexpectedTag(tag);
        }
    }
    function readUTF8CharWithoutTag() {
        return stream.readString(1);
    }
    function _readString() {
        var s = stream.readString(readInt(Tags.TagQuote));
        stream.skip(1);
        return s;
    }
    function readStringWithoutTag() {
        var s = _readString();
        refer.set(s);
        return s;
    }
    function readString() {
        var tag = stream.readByte();
        switch (tag) {
            case Tags.TagNull: return null;
            case Tags.TagEmpty: return '';
            case Tags.TagUTF8Char: return readUTF8CharWithoutTag();
            case Tags.TagString: return readStringWithoutTag();
            case Tags.TagRef: return readRef();
            default: unexpectedTag(tag);
        }
    }
    function readGuidWithoutTag() {
        stream.skip(1);
        var s = stream.readAsciiString(36);
        stream.skip(1);
        refer.set(s);
        return s;
    }
    function readGuid() {
        var tag = stream.readByte();
        switch (tag) {
            case Tags.TagNull: return null;
            case Tags.TagGuid: return readGuidWithoutTag();
            case Tags.TagRef: return readRef();
            default: unexpectedTag(tag);
        }
    }
    function readListWithoutTag() {
        var list = [];
        refer.set(list);
        var count = readInt(Tags.TagOpenbrace);
        for (var i = 0; i < count; i++) {
            list[i] = unserialize();
        }
        stream.skip(1);
        return list;
    }
    function readList() {
        var tag = stream.readByte();
        switch (tag) {
            case Tags.TagNull: return null;
            case Tags.TagList: return readListWithoutTag();
            case Tags.TagRef: return readRef();
            default: unexpectedTag(tag);
        }
    }
    function readMapWithoutTag() {
        var map = {};
        refer.set(map);
        var count = readInt(Tags.TagOpenbrace);
        for (var i = 0; i < count; i++) {
            var key = unserialize();
            var value = unserialize();
            map[key] = value;
        }
        stream.skip(1);
        return map;
    }
    function readMap() {
        var tag = stream.readByte();
        switch (tag) {
            case Tags.TagNull: return null;
            case Tags.TagMap: return readMapWithoutTag();
            case Tags.TagRef: return readRef();
            default: unexpectedTag(tag);
        }
    }
    function readHarmonyMapWithoutTag() {
        var map = new Map();
        refer.set(map);
        var count = readInt(Tags.TagOpenbrace);
        for (var i = 0; i < count; i++) {
            var key = unserialize();
            var value = unserialize();
            map.set(key, value);
        }
        stream.skip(1);
        return map;
    }
    function readHarmonyMap() {
        var tag = stream.readByte();
        switch (tag) {
            case Tags.TagNull: return null;
            case Tags.TagMap: return readHarmonyMapWithoutTag();
            case Tags.TagRef: return readRef();
            default: unexpectedTag(tag);
        }
    }
    function readObjectWithoutTag() {
        var cls = classref[readInt(Tags.TagOpenbrace)];
        var obj = new cls.classname();
        refer.set(obj);
        for (var i = 0; i < cls.count; i++) {
            obj[cls.fields[i]] = unserialize();
        }
        stream.skip(1);
        return obj;
    }
    function readObject() {
        var tag = stream.readByte();
        switch(tag) {
            case Tags.TagNull: return null;
            case Tags.TagClass: readClass(); return readObject();
            case Tags.TagObject: return readObjectWithoutTag();
            case Tags.TagRef: return readRef();
            default: unexpectedTag(tag);
        }
    }
    function readClass() {
        var classname = _readString();
        var count = readInt(Tags.TagOpenbrace);
        var fields = [];
        for (var i = 0; i < count; i++) {
            fields[i] = readString();
        }
        stream.skip(1);
        classname = getClass(classname);
        classref[classref.length] = {
            classname: classname,
            count: count,
            fields: fields
        };
    }
    function readRef() {
        return refer.read(readInt(Tags.TagSemicolon));
    }
    function reset() {
        classref.length = 0;
        refer.reset();
    }
    Object.defineProperties(this, {
        useHarmonyMap: { get: getUseHarmonyMap, set: setUseHarmonyMap },
        checkTag: { value: checkTag },
        checkTags: { value: checkTags },
        unserialize: { value: unserialize },
        readInteger: { value: readInteger },
        readLong: { value: readLong },
        readDouble: { value: readDouble },
        readBoolean: { value: readBoolean },
        readDateWithoutTag: { value: readDateWithoutTag },
        readDate: { value: readDate },
        readTimeWithoutTag: { value: readTimeWithoutTag },
        readTime: { value: readTime },
        readBytesWithoutTag: { value: readBytesWithoutTag },
        readBytes: { value: readBytes },
        readStringWithoutTag: { value: readStringWithoutTag },
        readString: { value: readString },
        readGuidWithoutTag: { value: readGuidWithoutTag },
        readGuid: { value: readGuid },
        readListWithoutTag: { value: readListWithoutTag },
        readList: { value: readList },
        readMapWithoutTag: { value: readMapWithoutTag },
        readMap: { value: readMap },
        readHarmonyMapWithoutTag: { value: readHarmonyMapWithoutTag },
        readHarmonyMap: { value: readHarmonyMap },
        readObjectWithoutTag: { value: readObjectWithoutTag },
        readObject: { value: readObject },
        reset: { value: reset }
    });
}

global.hprose.Reader = Reader;
