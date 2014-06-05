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
 * HproseReader.js                                        *
 *                                                        *
 * HproseReader for Node.js.                              *
 *                                                        *
 * LastModified: Mar 29, 2014                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
/*jshint unused:false */
'use strict';

var HproseTags = require('./HproseTags.js');
var HproseClassManager = require('./HproseClassManager.js');
var HproseException = require('../common/HproseException.js');
var HproseRawReader = require('./HproseRawReader.js');

var fakeReaderRefer = {
    set: function (val) {},
    read: function (index) {
        throw new HproseException('Unexpected serialize tag "' +
                                  String.fromCharCode(HproseTags.TagRef) +
                                  '" in stream');
    },
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

function getClass(classname) {
    var cls = HproseClassManager.getClass(classname);
    if (cls) return cls;
    cls = function() {};
    HproseClassManager.register(cls, classname);
    return cls;
}

function HproseReader(stream, simple, useHarmonyMap) {
    HproseRawReader.call(this, stream);
    var classref = [];
    var refer = (simple ? fakeReaderRefer : realReaderRefer());
    var unexpectedTag = this.unexpectedTag;
    function checkTag(expectTag, tag) {
        if (tag === undefined) tag = stream.getc();
        if (tag !== expectTag) unexpectedTag(tag, expectTag);
    }
    function checkTags(expectTags, tag) {
        if (tag === undefined) tag = stream.getc();
        if (expectTags.indexOf(tag) >= 0) return tag;
        unexpectedTag(tag, expectTags);
    }
    function readInt(tag) {
        var s = stream.readuntil(tag);
        if (s.length === 0) return 0;
        return parseInt(s, 10);
    }
    function unserialize() {
        var tag = stream.getc();
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
            case HproseTags.TagInteger: return readIntegerWithoutTag();
            case HproseTags.TagLong: return readLongWithoutTag();
            case HproseTags.TagDouble: return readDoubleWithoutTag();
            case HproseTags.TagNull: return null;
            case HproseTags.TagEmpty: return '';
            case HproseTags.TagTrue: return true;
            case HproseTags.TagFalse: return false;
            case HproseTags.TagNaN: return NaN;
            case HproseTags.TagInfinity: return readInfinityWithoutTag();
            case HproseTags.TagDate: return readDateWithoutTag();
            case HproseTags.TagTime: return readTimeWithoutTag();
            case HproseTags.TagBytes: return readBytesWithoutTag();
            case HproseTags.TagUTF8Char: return readUTF8CharWithoutTag();
            case HproseTags.TagString: return readStringWithoutTag();
            case HproseTags.TagGuid: return readGuidWithoutTag();
            case HproseTags.TagList: return readListWithoutTag();
            case HproseTags.TagMap: return useHarmonyMap ? readHarmonyMapWithoutTag() : readMapWithoutTag();
            case HproseTags.TagClass: readClass(); return readObject();
            case HproseTags.TagObject: return readObjectWithoutTag();
            case HproseTags.TagRef: return readRef();
            case HproseTags.TagError: throw new HproseException(readString());
            default: unexpectedTag(tag);
        }
    }
    function readIntegerWithoutTag() {
        return readInt(HproseTags.TagSemicolon);
    }
    function readInteger() {
        var tag = stream.getc();
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
            case HproseTags.TagInteger: return readIntegerWithoutTag();
            default: unexpectedTag(tag);
        }
    }
    function readLongWithoutTag() {
        var s = stream.readuntil(HproseTags.TagSemicolon);
        var l = parseInt(s, 10);
        if (l.toString() === s) return l;
        return s;
    }
    function readLong() {
        var tag = stream.getc();
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
            case HproseTags.TagInteger:
            case HproseTags.TagLong: return readLongWithoutTag();
            default: unexpectedTag(tag);
        }
    }
    function readDoubleWithoutTag() {
        return parseFloat(stream.readuntil(HproseTags.TagSemicolon));
    }
    function readDouble() {
        var tag = stream.getc();
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
            case HproseTags.TagInteger:
            case HproseTags.TagLong:
            case HproseTags.TagDouble: return readDoubleWithoutTag();
            case HproseTags.TagNaN: return NaN;
            case HproseTags.TagInfinity: return readInfinityWithoutTag();
            default: unexpectedTag(tag);
        }
    }
    function readInfinityWithoutTag() {
        return ((stream.getc() === HproseTags.TagNeg) ? -Infinity : Infinity);
    }
    function readBoolean() {
        var tag = stream.getc();
        switch (tag) {
            case HproseTags.TagTrue: return true;
            case HproseTags.TagFalse: return false;
            default: unexpectedTag(tag);
        }
    }
    function readDateWithoutTag() {
        var year = parseInt(stream.readAsciiString(4), 10);
        var month = parseInt(stream.readAsciiString(2), 10) - 1;
        var day = parseInt(stream.readAsciiString(2), 10);
        var date;
        var tag = stream.getc();
        if (tag === HproseTags.TagTime) {
            var hour = parseInt(stream.readAsciiString(2), 10);
            var minute = parseInt(stream.readAsciiString(2), 10);
            var second = parseInt(stream.readAsciiString(2), 10);
            var millisecond = 0;
            tag = stream.getc();
            if (tag === HproseTags.TagPoint) {
                millisecond = parseInt(stream.readAsciiString(3), 10);
                tag = stream.getc();
                if ((tag >= 48) && (tag <= 57)) {
                    stream.skip(2);
                    tag = stream.getc();
                    if ((tag >= 48) && (tag <= 57)) {
                        stream.skip(2);
                        tag = stream.getc();
                    }
                }
            }
            if (tag === HproseTags.TagUTC) {
                date = new Date(Date.UTC(year, month, day, hour, minute, second, millisecond));
            }
            else {
                date = new Date(year, month, day, hour, minute, second, millisecond);
            }
        }
        else if (tag === HproseTags.TagUTC) {
            date = new Date(Date.UTC(year, month, day));
        }
        else {
            date = new Date(year, month, day);
        }
        refer.set(date);
        return date;
    }
    function readDate() {
        var tag = stream.getc();
        switch (tag) {
            case HproseTags.TagNull: return null;
            case HproseTags.TagDate: return readDateWithoutTag();
            case HproseTags.TagRef: return readRef();
            default: unexpectedTag(tag);
        }
    }
    function readTimeWithoutTag() {
        var time;
        var hour = parseInt(stream.readAsciiString(2), 10);
        var minute = parseInt(stream.readAsciiString(2), 10);
        var second = parseInt(stream.readAsciiString(2), 10);
        var millisecond = 0;
        var tag = stream.getc();
        if (tag === HproseTags.TagPoint) {
            millisecond = parseInt(stream.readAsciiString(3), 10);
            tag = stream.getc();
            if ((tag >= 48) && (tag <= 57)) {
                stream.skip(2);
                tag = stream.getc();
                if ((tag >= 48) && (tag <= 57)) {
                    stream.skip(2);
                    tag = stream.getc();
                }
            }
        }
        if (tag === HproseTags.TagUTC) {
            time = new Date(Date.UTC(1970, 0, 1, hour, minute, second, millisecond));
        }
        else {
            time = new Date(1970, 0, 1, hour, minute, second, millisecond);
        }
        refer.set(time);
        return time;
    }
    function readTime() {
        var tag = stream.getc();
        switch (tag) {
            case HproseTags.TagNull: return null;
            case HproseTags.TagTime: return readTimeWithoutTag();
            case HproseTags.TagRef: return readRef();
            default: unexpectedTag(tag);
        }
    }
    function readBytesWithoutTag() {
        var count = readInt(HproseTags.TagQuote);
        var bytes = stream.read(count);
        stream.skip(1);
        refer.set(bytes);
        return bytes;
    }
    function readBytes() {
        var tag = stream.getc();
        switch (tag) {
            case HproseTags.TagNull: return null;
            case HproseTags.TagEmpty: return new Buffer(0);
            case HproseTags.TagBytes: return readBytesWithoutTag();
            case HproseTags.TagRef: return readRef();
            default: unexpectedTag(tag);
        }
    }
    function readUTF8CharWithoutTag() {
        return stream.readUTF8String(1);
    }
    function _readString() {
        var s = stream.readUTF8String(readInt(HproseTags.TagQuote));
        stream.skip(1);
        return s;
    }
    function readStringWithoutTag() {
        var s = _readString();
        refer.set(s);
        return s;
    }
    function readString() {
        var tag = stream.getc();
        switch (tag) {
            case HproseTags.TagNull: return null;
            case HproseTags.TagEmpty: return '';
            case HproseTags.TagUTF8Char: return readUTF8CharWithoutTag();
            case HproseTags.TagString: return readStringWithoutTag();
            case HproseTags.TagRef: return readRef();
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
        var tag = stream.getc();
        switch (tag) {
            case HproseTags.TagNull: return null;
            case HproseTags.TagGuid: return readGuidWithoutTag();
            case HproseTags.TagRef: return readRef();
            default: unexpectedTag(tag);
        }
    }
    function readListWithoutTag() {
        var list = [];
        refer.set(list);
        var count = readInt(HproseTags.TagOpenbrace);
        for (var i = 0; i < count; i++) {
            list[i] = unserialize();
        }
        stream.skip(1);
        return list;
    }
    function readList() {
        var tag = stream.getc();
        switch (tag) {
            case HproseTags.TagNull: return null;
            case HproseTags.TagList: return readListWithoutTag();
            case HproseTags.TagRef: return readRef();
            default: unexpectedTag(tag);
        }
    }
    function readMapWithoutTag() {
        var map = {};
        refer.set(map);
        var count = readInt(HproseTags.TagOpenbrace);
        for (var i = 0; i < count; i++) {
            var key = unserialize();
            var value = unserialize();
            map[key] = value;
        }
        stream.skip(1);
        return map;
    }
    function readMap() {
        var tag = stream.getc();
        switch (tag) {
            case HproseTags.TagNull: return null;
            case HproseTags.TagMap: return readMapWithoutTag();
            case HproseTags.TagRef: return readRef();
            default: unexpectedTag(tag);
        }
    }
    function readHarmonyMapWithoutTag() {
        var map = new Map();
        refer.set(map);
        var count = readInt(HproseTags.TagOpenbrace);
        for (var i = 0; i < count; i++) {
            var key = unserialize();
            var value = unserialize();
            map.set(key, value);
        }
        stream.skip(1);
        return map;
    }
    function readHarmonyMap() {
        var tag = stream.getc();
        switch (tag) {
        case HproseTags.TagNull: return null;
        case HproseTags.TagMap: return readHarmonyMapWithoutTag();
        case HproseTags.TagRef: return readRef();
        default: unexpectedTag(tag);
        }
    }
    function readObjectWithoutTag() {
        var cls = classref[readInt(HproseTags.TagOpenbrace)];
        var obj = new cls.classname();
        refer.set(obj);
        for (var i = 0; i < cls.count; i++) {
            obj[cls.fields[i]] = unserialize();
        }
        stream.skip(1);
        return obj;
    }
    function readObject() {
        var tag = stream.getc();
        switch(tag) {
            case HproseTags.TagNull: return null;
            case HproseTags.TagClass: readClass(); return readObject();
            case HproseTags.TagObject: return readObjectWithoutTag();
            case HproseTags.TagRef: return readRef();
            default: unexpectedTag(tag);
        }
    }
    function readClass() {
        var classname = _readString();
        var count = readInt(HproseTags.TagOpenbrace);
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
        return refer.read(readInt(HproseTags.TagSemicolon));
    }
    function reset() {
        classref.length = 0;
        refer.reset();
    }
    this.stream = stream;
    this.checkTag = checkTag;
    this.checkTags = checkTags;
    this.unserialize = unserialize;
    this.readInteger = readInteger;
    this.readLong = readLong;
    this.readDouble = readDouble;
    this.readBoolean = readBoolean;
    this.readDateWithoutTag = readDateWithoutTag;
    this.readDate = readDate;
    this.readTimeWithoutTag = readTimeWithoutTag;
    this.readTime = readTime;
    this.readBytesWithoutTag = readBytesWithoutTag;
    this.readBytes = readBytes;
    this.readStringWithoutTag = readStringWithoutTag;
    this.readString = readString;
    this.readGuidWithoutTag = readGuidWithoutTag;
    this.readGuid = readGuid;
    this.readListWithoutTag = readListWithoutTag;
    this.readList = readList;
    this.readMapWithoutTag = readMapWithoutTag;
    this.readMap = readMap;
    this.readHarmonyMapWithoutTag = readHarmonyMapWithoutTag;
    this.readHarmonyMap = readHarmonyMap;
    this.readObjectWithoutTag = readObjectWithoutTag;
    this.readObject = readObject;
    this.reset = reset;
}

module.exports = HproseReader;