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
 * hprose/io/BytesIO.js                                   *
 *                                                        *
 * Hprose BytesIO for Node.js.                            *
 *                                                        *
 * LastModified: Aug 11, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var _EMPTY_BYTES = new Uint8Array(0);
var _INIT_SIZE = 1024;
var indexof = Function.prototype.call.bind(Array.prototype.indexOf);

function writeInt32BE(bytes, p, i) {
    bytes[p++] = i >>> 24 & 0xff;
    bytes[p++] = i >>> 16 & 0xff;
    bytes[p++] = i >>> 8  & 0xff;
    bytes[p++] = i        & 0xff;
    return p;
}

function writeInt32LE(bytes, p, i) {
    bytes[p++] = i        & 0xff;
    bytes[p++] = i >>> 8  & 0xff;
    bytes[p++] = i >>> 16 & 0xff;
    bytes[p++] = i >>> 24 & 0xff;
    return p;
}

function writeString(bytes, p, str) {
    var n = str.length;
    for (var i = 0; i < n; ++i) {
        var codeUnit = str.charCodeAt(i);
        if (codeUnit < 0x80) {
            bytes[p++] = codeUnit;
        }
        else if (codeUnit < 0x800) {
            bytes[p++] = 0xC0 | (codeUnit >> 6);
            bytes[p++] = 0x80 | (codeUnit & 0x3F);
        }
        else if (codeUnit < 0xD800 || codeUnit > 0xDfff) {
            bytes[p++] = 0xE0 | (codeUnit >> 12);
            bytes[p++] = 0x80 | ((codeUnit >> 6) & 0x3F);
            bytes[p++] = 0x80 | (codeUnit & 0x3F);
        }
        else {
            if (i + 1 < n) {
                var nextCodeUnit = str.charCodeAt(i + 1);
                if (codeUnit < 0xDC00 && 0xDC00 <= nextCodeUnit && nextCodeUnit <= 0xDFFF) {
                    var rune = (((codeUnit & 0xDC00) << 10) | (nextCodeUnit & 0x03FF)) + 0x010000;
                    bytes[p++] = 0xF0 | ((rune >> 18) & 0x3F);
                    bytes[p++] = 0x80 | ((rune >> 12) & 0x3F);
                    bytes[p++] = 0x80 | ((rune >> 6) & 0x3F);
                    bytes[p++] = 0x80 | (rune & 0x3F);
                    ++i;
                    continue;
                }
            }
            throw new Error('Malformed string');
        }
    }
    return p;
}

function readShortString(bytes, n) {
    var charCodes = new Uint16Array(n);
    var i = 0, off = 0;
    for (var len = bytes.length; i < n && off < len; i++) {
        var unit = bytes[off++];
        switch (unit >> 4) {
        case 0:
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
        case 7:
            charCodes[i] = unit;
            break;
        case 12:
        case 13:
            if (off < len) {
                charCodes[i] = ((unit & 0x1F) << 6) |
                                (bytes[off++] & 0x3F);
            }
            else {
                throw new Error('Unfinished UTF-8 octet sequence');
            }
            break;
        case 14:
            if (off + 1 < len) {
                charCodes[i] = ((unit & 0x0F) << 12) |
                               ((bytes[off++] & 0x3F) << 6) |
                               (bytes[off++] & 0x3F);
            }
            else {
                throw new Error('Unfinished UTF-8 octet sequence');
            }
            break;
        case 15:
            if (off + 2 < len) {
                var rune = ((unit & 0x07) << 18) |
                            ((bytes[off++] & 0x3F) << 12) |
                            ((bytes[off++] & 0x3F) << 6) |
                            (bytes[off++] & 0x3F) - 0x10000;
                if (0 <= rune && rune <= 0xFFFFF) {
                    charCodes[i++] = (((rune >> 10) & 0x03FF) | 0xD800);
                    charCodes[i] = ((rune & 0x03FF) | 0xDC00);
                }
                else {
                    throw new Error('Character outside valid Unicode range: 0x' + rune.toString(16));
                }
            }
            else {
                throw new Error('Unfinished UTF-8 octet sequence');
            }
            break;
        default:
            throw new Error('Bad UTF-8 encoding 0x' + unit.toString(16));
        }
    }
    if (i < n) {
        charCodes = charCodes.subarray(0, i);
    }
    return [String.fromCharCode.apply(String, charCodes), off];
}

function readLongString(bytes, n) {
    var buf = [];
    var charCodes = new Uint16Array(0xffff);
    var i = 0, off = 0;
    for (var len = bytes.length; i < n && off < len; i++) {
        var unit = bytes[off++];
        switch (unit >> 4) {
        case 0:
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
        case 7:
            charCodes[i] = unit;
            break;
        case 12:
        case 13:
            if (off < len) {
                charCodes[i] = ((unit & 0x1F) << 6) |
                                (bytes[off++] & 0x3F);
            }
            else {
                throw new Error('Unfinished UTF-8 octet sequence');
            }
            break;
        case 14:
            if (off + 1 < len) {
                charCodes[i] = ((unit & 0x0F) << 12) |
                               ((bytes[off++] & 0x3F) << 6) |
                               (bytes[off++] & 0x3F);
            }
            else {
                throw new Error('Unfinished UTF-8 octet sequence');
            }
            break;
        case 15:
            if (off + 2 < len) {
                var rune = ((unit & 0x07) << 18) |
                            ((bytes[off++] & 0x3F) << 12) |
                            ((bytes[off++] & 0x3F) << 6) |
                            (bytes[off++] & 0x3F) - 0x10000;
                if (0 <= rune && rune <= 0xFFFFF) {
                    charCodes[i++] = (((rune >> 10) & 0x03FF) | 0xD800);
                    charCodes[i] = ((rune & 0x03FF) | 0xDC00);
                }
                else {
                    throw new Error('Character outside valid Unicode range: 0x' + rune.toString(16));
                }
            }
            else {
                throw new Error('Unfinished UTF-8 octet sequence');
            }
            break;
        default:
            throw new Error('Bad UTF-8 encoding 0x' + unit.toString(16));
        }
        if (i >= 65534) {
            var size = i + 1;
            buf.push(String.fromCharCode.apply(String, charCodes.subarray(0, size)));
            n -= size;
            i = -1;
        }
    }
    if (i > 0) {
        buf.push(String.fromCharCode.apply(String, charCodes.subarray(0, i)));
    }
    return [buf.join(''), off];
}

function readString(bytes, n) {
    if (n === undefined || n === null || (n < 0)) n = bytes.length;
    if (n === 0) return ['', 0];
    return ((n < 100000) ?
            readShortString(bytes, n) :
            readLongString(bytes, n));
}

function readStringAsBytes(bytes, n) {
    if (n === undefined) n = bytes.length;
    if (n === 0) return _EMPTY_BYTES;
    var i = 0, off = 0;
    for (var len = bytes.length; i < n && off < len; i++) {
        var unit = bytes[off++];
        switch (unit >> 4) {
        case 0:
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
        case 7:
            break;
        case 12:
        case 13:
            if (off < len) {
                off++;
            }
            else {
                throw new Error('Unfinished UTF-8 octet sequence');
            }
            break;
        case 14:
            if (off + 1 < len) {
                off += 2;
            }
            else {
                throw new Error('Unfinished UTF-8 octet sequence');
            }
            break;
        case 15:
            if (off + 2 < len) {
                var rune = ((unit & 0x07) << 18) |
                            ((bytes[off++] & 0x3F) << 12) |
                            ((bytes[off++] & 0x3F) << 6) |
                            (bytes[off++] & 0x3F) - 0x10000;
                if (0 <= rune && rune <= 0xFFFFF) {
                    i++;
                }
                else {
                    throw new Error('Character outside valid Unicode range: 0x' + rune.toString(16));
                }
            }
            else {
                throw new Error('Unfinished UTF-8 octet sequence');
            }
            break;
        default:
            throw new Error('Bad UTF-8 encoding 0x' + unit.toString(16));
        }
    }
    return [bytes.subarray(0, off), off];
}

function pow2roundup(x) {
    --x;
    x |= x >> 1;
    x |= x >> 2;
    x |= x >> 4;
    x |= x >> 8;
    x |= x >> 16;
    return x + 1;
}

function BytesIO() {
    var a = arguments;
    switch (a.length) {
    case 1:
        switch (a[0].constructor) {
        case Uint8Array:
            this._bytes = a[0];
            this._length = a[0].length;
            break;
        case BytesIO:
            this._bytes = a[0].toBytes();
            this._length = a[0].length;
            break;
        case String:
            this.writeString(a[0]);
            break;
        case Number:
            this._bytes = new Uint8Array(a[0]);
            break;
        default:
            this._bytes = new Uint8Array(a[0]);
            this._length = this._bytes.length;
            break;
        }
        break;
    case 2:
        this._bytes = new Uint8Array(a[0], a[1]);
        this._length = a[1];
        break;
    case 3:
        this._bytes = new Uint8Array(a[0], a[1], a[2]);
        this._length = a[2];
        break;
    }
    this.mark();
}

Object.defineProperties(BytesIO.prototype, {
    _bytes: { value: null, writable: true },
    _length: { value: 0, writable: true },
    _wmark: { value: 0, writable: true },
    _off: { value: 0, writable: true },
    _rmark: { value: 0, writable: true },
    _grow: { value: function(n) {
        var bytes = this._bytes;
        var required = this._length + n;
        var size = pow2roundup(required);
        if (bytes) {
            size *= 2;
            if (size > bytes.length) {
                var buf = new Uint8Array(size);
                buf.set(bytes);
                this._bytes = buf;
            }
        }
        else {
            size = Math.max(size, _INIT_SIZE);
            this._bytes = new Uint8Array(size);
        }
    } },
    length: { get: function() { return this._length; } },
    capacity: { get: function() {
        return this._bytes ? this._bytes.length : 0;
    } },
    position: { get: function() { return this._off; } },
    // returns a view of the the internal buffer.
    bytes: { get : function() {
        return (this._bytes === null) ?
                _EMPTY_BYTES :
                this._bytes.subarray(0, this._length);
    } },
    mark: { value: function() {
        this._wmark = this._length;
        this._rmark = this._off;
    } },
    reset: { value: function() {
        this._length = this._wmark;
        this._off = this._rmark;
    } },
    clear: { value: function() {
        this._bytes = null;
        this._length = 0;
        this._wmark = 0;
        this._off = 0;
        this._rmark = 0;
    } },
    writeByte: { value: function(b) {
        this._grow(1);
        this._bytes[this._length++] = b;
    } },
    writeInt32BE: { value: function(i) {
        if ((i === (i | 0)) && (i <= 2147483647)) {
            this._grow(4);
            this._length = writeInt32BE(this._bytes, this._length, i);
            return;
        }
        throw new TypeError('value is out of bounds');
    } },
    writeUInt32BE: { value: function(i) {
        if ((i === (i | 0)) && (i >= 0)) {
            this._grow(4);
            this._length = writeInt32BE(this._bytes, this._length, i);
            return;
        }
        throw new TypeError('value is out of bounds');
    } },
    writeInt32LE: { value: function(i) {
        if ((i === (i | 0)) && (i <= 2147483647)) {
            this._grow(4);
            this._length = writeInt32LE(this._bytes, this._length, i);
            return;
        }
        throw new TypeError('value is out of bounds');
    } },
    writeUInt32LE: { value: function(i) {
        if ((i === (i | 0)) && (i >= 0)) {
            this._grow(4);
            this._length = writeInt32LE(this._bytes, this._length, i);
            return;
        }
        throw new TypeError('value is out of bounds');
    } },
    write: { value: function(data) {
        var n = data.byteLength || data.length;
        if (n === 0) return;
        this._grow(n);
        var bytes = this._bytes;
        var length = this._length;
        switch (data.constructor) {
        case ArrayBuffer:
            bytes.set(new Uint8Array(data), length);
            break;
        case Uint8Array:
            bytes.set(data, length);
            break;
        case BytesIO:
            bytes.set(data.bytes, length);
            break;
        default:
            for (var i = 0; i < n; i++) {
                bytes[length + i] = data[i];
            }
            break;
        }
        this._length += n;
    } },
    writeAsciiString: { value: function(str) {
        var n = str.length;
        if (n === 0) return;
        this._grow(n);
        var bytes = this._bytes;
        var l = this._length;
        for (var i = 0; i < n; ++i, ++l) {
            bytes[l] = str.charCodeAt(i);
        }
        this._length = l;
    } },
    writeString: { value: function(str) {
        var n = str.length;
        if (n === 0) return;
        // A single code unit uses at most 3 bytes.
        // Two code units at most 4.
        this._grow(n * 3);
        this._length = writeString(this._bytes, this._length, str);
    } },
    readByte: { value: function() {
        if (this._off < this._length) {
            return this._bytes[this._off++];
        }
        return -1;
    } },
    readInt32BE: { value: function() {
        var bytes = this._bytes;
        var off = this._off;
        if (off + 3 < this._length) {
            var result = bytes[off++] << 24 |
                         bytes[off++] << 16 |
                         bytes[off++] << 8  |
                         bytes[off++];
            this._off = off;
            return result;
        }
        throw new Error('EOF');
    } },
    readUInt32BE: { value: function() {
        var value = this.readInt32BE();
        if (value < 0) {
            return (value & 0x7fffffff) + 0x80000000;
        }
        return value;
    } },
    readInt32LE: { value: function() {
        var bytes = this._bytes;
        var off = this._off;
        if (off + 3 < this._length) {
            var result = bytes[off++]       |
                         bytes[off++] << 8  |
                         bytes[off++] << 16 |
                         bytes[off++] << 24;
            this._off = off;
            return result;
        }
        throw new Error('EOF');
    } },
    readUInt32LE: { value: function() {
        var value = this.readInt32LE();
        if (value < 0) {
            return (value & 0x7fffffff) + 0x80000000;
        }
        return value;
    } },
    read: { value: function(n) {
        if (this._off + n > this._length) {
            n = this._length - this._off;
        }
        if (n === 0) return _EMPTY_BYTES;
        return this._bytes.subarray(this._off, this._off += n);
    } },
    skip: { value: function(n) {
        if (this._off + n > this._length) {
            n = this._length - this._off;
            this._off = this._length;
        }
        else {
            this._off += n;
        }
        return n;
    } },
    // the result is an Uint8Array, and includes tag.
    readBytes: { value: function(tag) {
        var pos = indexof(this._bytes, tag, this._off);
        var buf;
        if (pos === -1) {
            buf = this._bytes.subarray(this._off, this._length);
            this._off = this._length;
        }
        else {
            buf = this._bytes.subarray(this._off, pos + 1);
            this._off = pos + 1;
        }
        return buf;
    } },
    // the result is a String, and doesn't include tag.
    // but the position is the same as readBytes
    readUntil: { value: function(tag) {
        var pos = indexof(this._bytes, tag, this._off);
        var str = '';
        if (pos === this._off) {
            this._off++;
        }
        else if (pos === -1) {
            str = readString(this._bytes.subarray(this._off, this._length))[0];
            this._off = this._length;
        }
        else {
            str = readString(this._bytes.subarray(this._off, pos))[0];
            this._off = pos + 1;
        }
        return str;
    } },
    readAsciiString: { value: function(n) {
        if (this._off + n > this._length) {
            n = this._length - this._off;
        }
        if (n === 0) return '';
        var bytes = this._bytes.subarray(this._off, this._off += n);
        if (n < 100000) {
            return String.fromCharCode.apply(String, bytes);
        }
        var remain = n & 0xffff;
        var count = n >> 16;
        var a = new Array(remain ? count + 1 : count);
        for (var i = 0; i < count; ++i) {
            a[i] = String.fromCharCode.apply(String, bytes.subarray(i << 16, (i + 1) << 16));
        }
        if (remain) {
            a[count] = String.fromCharCode.apply(String, bytes.subarray(count << 16, n));
        }
        return a.join('');
    } },
    // n is the UTF16 length
    readStringAsBytes: { value: function(n) {
        var r = readStringAsBytes(this._bytes.subarray(this._off, this._length), n);
        this._off += r[1];
        return r[0];
    } },
    // n is the UTF16 length
    readString: { value: function(n) {
        var r = readString(this._bytes.subarray(this._off, this._length), n);
        this._off += r[1];
        return r[0];
    } },
    // returns a view of the the internal buffer and clears `this`.
    takeBytes: { value: function() {
        var buffer = this.bytes;
        this.clear();
        return buffer;
    } },
    // returns a copy of the current contents and leaves `this` intact.
    toBytes: { value: function() {
        return new Uint8Array(this.bytes);
    } },
    // returns a Buffer copy of the current contents and leaves `this` intact.
    toBuffer: { value: function() {
        var bytes = this._bytes;
        var length = this._length;
        var buffer = new Buffer(length);
        for (var i = 0; i < length; ++i) {
            buffer[i] = bytes[i];
        }
        return buffer;
    } },
    toString: { value: function() {
        return readString(this.bytes, this._length)[0];
    } },
    clone: { value: function() {
        return new BytesIO(this.toBytes());
    } },
    trunc: { value: function() {
        this._bytes = this._bytes.subarray(this._off, this._length);
        this._length = this._bytes.length;
        this._off = 0;
        this._wmark = 0;
        this._rmark = 0;
    } }
});

function toString(data) {
    /* jshint -W086 */
    if (data.length === 0) return '';
    switch(data.constructor) {
    case String: return data;
    case Buffer: return data.toString();
    case BytesIO: data = data.bytes;
    case ArrayBuffer: data = new Uint8Array(data);
    case Uint8Array: return readString(data, data.length)[0];
    default: return String.fromCharCode.apply(String, data);
    }
}

function toBuffer(data) {
    /* jshint -W086 */
    switch(data.constructor) {
    case Buffer: return data;
    case ArrayBuffer: data = new Uint8Array(data);
    case Uint8Array: data = new BytesIO(data);
    case BytesIO: return data.toBuffer();
    default: return new Buffer(data);
    }
}

Object.defineProperties(BytesIO, {
    toString: { value: toString },
    toBuffer: { value: toBuffer }
});

global.hprose.BytesIO = BytesIO;
