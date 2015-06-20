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
 * LastModified: Jun 20, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var _EMPTY_BYTES = new Uint8Array(0);
var _INIT_SIZE = 1024;

function getUTF8String(array, n) {
    if (n === undefined) n = array.length;
    if (n === 0) return ['', 0];
    var charCodes = new Uint16Array(n);
    var i = 0, off = 0;
    for (var len = array.length; i < n && off < len; i++) {
        var unit = array[off++];
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
                                (array[off++] & 0x3F);
            }
            else {
                throw new Error('Unfinished UTF-8 octet sequence');
            }
            break;
        case 14:
            if (off + 1 < len) {
                charCodes[i] = ((unit & 0x0F) << 12) |
                               ((array[off++] & 0x3F) << 6) |
                               (array[off++] & 0x3F);
            }
            else {
                throw new Error('Unfinished UTF-8 octet sequence');
            }
            break;
        case 15:
            if (off + 2 < len) {
                var rune = ((unit & 0x07) << 18) |
                            ((array[off++] & 0x3F) << 12) |
                            ((array[off++] & 0x3F) << 6) |
                            (array[off++] & 0x3F) - 0x10000;
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

function BytesIO() {
    var _bytes = null;
    var _length = 0;    // for write
    var _wmark = 0;     // for write
    var _off = 0;       // for read
    var _rmark = 0;     // for read

    function _pow2roundup(x) {
        --x;
        x |= x >> 1;
        x |= x >> 2;
        x |= x >> 4;
        x |= x >> 8;
        x |= x >> 16;
        return x + 1;
    }

    function _grow(n) {
        var required = _length + n;
        var size = _pow2roundup(required);
        if (_bytes) {
            size *= 2;
            if (size > _bytes.length) {
                var buf = new Uint8Array(size);
                buf.set(_bytes);
                _bytes = buf;
            }
        }
        else {
            size = Math.max(size, _INIT_SIZE);
            _bytes = new Uint8Array(size);
        }
    }

    function length() { return _length; }

    function capacity() { return _bytes ? _bytes.length : 0; }

    function position() { return _off; }

    function clear() {
        _bytes = null;
        _length = 0;
        _wmark = 0;
        _off = 0;
        _rmark = 0;
    }

    function mark() {
        _wmark = _length;
        _rmark = _off;
    }

    function reset() {
        _length = _wmark;
        _off = _rmark;
    }

    function writeByte(b) {
        _grow(1);
        _bytes[_length++] = b;
    }

    function write(data) {
        var n = data.byteLength || data.length;
        if (n === 0) return;
        _grow(n);
        switch (data.constructor) {
        case ArrayBuffer:
            _bytes.set(new Uint8Array(data), _length);
            break;
        case Uint8Array:
            _bytes.set(data, _length);
            break;
        case BytesIO:
            _bytes.set(data.toBytes(), _length);
            break;
        default:
            for (var i = 0; i < n; i++) {
                _bytes[_length + i] = data[i];
            }
            break;
        }
        _length += n;
    }

    function writeAsciiString(str) {
        var n = str.length;
        if (n === 0) return;
        _grow(n);
        for (var i = 0; i < n; i++) {
            _bytes[_length++] = str.charCodeAt(i);
        }
    }

    function writeString(str) {
        var n = str.length;
        if (n === 0) return;
        // A single code unit uses at most 3 bytes.
        // Two code units at most 4.
        _grow(n * 3);
        for (var i = 0; i < n; i++) {
            var codeUnit = str.charCodeAt(i);
            if (codeUnit < 0x80) {
                _bytes[_length++] = codeUnit;
            }
            else if (codeUnit < 0x800) {
                _bytes[_length++] = 0xC0 | (codeUnit >> 6);
                _bytes[_length++] = 0x80 | (codeUnit & 0x3F);
            }
            else if (codeUnit < 0xD800 || codeUnit > 0xDfff) {
                _bytes[_length++] = 0xE0 | (codeUnit >> 12);
                _bytes[_length++] = 0x80 | ((codeUnit >> 6) & 0x3F);
                _bytes[_length++] = 0x80 | (codeUnit & 0x3F);
            }
            else {
                if (i + 1 < n) {
                    var nextCodeUnit = str.codeUnitAt(i + 1);
                    if (codeUnit < 0xDC00 && 0xDC00 <= nextCodeUnit && nextCodeUnit <= 0xDFFF) {
                        var rune = (((codeUnit & 0xDC00) << 10) | (nextCodeUnit & 0x03FF)) + 0x010000;
                        _bytes[_length++] = 0xF0 | ((rune >> 18) & 0x3F);
                        _bytes[_length++] = 0x80 | ((rune >> 12) & 0x3F);
                        _bytes[_length++] = 0x80 | ((rune >> 6) & 0x3F);
                        _bytes[_length++] = 0x80 | (rune & 0x3F);
                        i++;
                        continue;
                    }
                }
                throw new Error('Malformed string');
            }
        }
    }

    function readByte() {
        if (_off < _length) {
            return _bytes[_off++];
        }
        return -1;
    }

    function read(n) {
        if (_off + n > _length) {
            n = _length - _off;
        }
        if (n === 0) return _EMPTY_BYTES;
        return new Uint8Array(_bytes.subarray(_off, _off += n));
    }

    function skip(n) {
        if (_off + n > _length) {
            n = _length - _off;
            _off = _length;
        }
        else {
            _off += n;
        }
        return n;
    }

    // the result is an Uint8Array, and includes tag.
    function readBytes(tag) {
        var pos = Array.prototype.indexOf.call(_bytes, tag, _off);
        var buf;
        if (pos === -1) {
            buf = _bytes.subarray(_off, _length);
            _off = _length;
        }
        else {
            buf = _bytes.subarray(_off, pos + 1);
            _off = pos + 1;
        }
        return buf;
    }

    // the result is a String, and doesn't include tag.
    // but the position is the same as readBytes
    function readUntil(tag) {
        var pos = Array.prototype.indexOf.call(_bytes, tag, _off);
        var str = '';
        if (pos === _off) {
            _off++;
        }
        else if (pos === -1) {
            str = getUTF8String(_bytes.subarray(_off, _length))[0];
            _off = _length;
        }
        else {
            str = getUTF8String(_bytes.subarray(_off, pos))[0];
            _off = pos + 1;
        }
        return str;
    }

    function readAsciiString(n) {
        if (_off + n > _length) {
            n = _length - _off;
        }
        if (n === 0) return '';
        return String.fromCharCode.apply(String, _bytes.subarray(_off, _off += n));
    }

    // n is the UTF16 length
    function readString(n) {
        var r = getUTF8String(_bytes.subarray(_off, _length), n);
        _off += r[1];
        return r[0];
    }

    // returns a view of the the internal buffer.
    function bytes() {
        return (_bytes === null) ? _EMPTY_BYTES : _bytes.subarray(0, _length);
    }

    // returns a view of the the internal buffer and clears `this`.
    function takeBytes() {
        var buffer = bytes();
        clear();
        return buffer;
    }

    // returns a copy of the current contents and leaves `this` intact.
    function toBytes() {
        return new Uint8Array(bytes());
    }

    // returns a Buffer copy of the current contents and leaves `this` intact.
    function toBuffer() {
        var buffer = new Buffer(_length);
        for (var i = 0; i < _length; ++i) {
            buffer[i] = _bytes[i];
        }
        return buffer;
    }

    function toString() {
        return getUTF8String(bytes(), _length)[0];
    }

    function clone() {
        return new BytesIO(toBytes());
    }

    function trunc() {
        _bytes = _bytes.subarray(_off, _length);
        _length = _bytes.length;
        _off = 0;
        _wmark = 0;
        _rmark = 0;
    }

    /* function constructor() */ {
        var a = arguments;
        switch (a.length) {
        case 1:
            switch (a[0].constructor) {
            case Uint8Array: _bytes = a[0]; _length = a[0].length; break;
            case BytesIO: _bytes = a[0].toBytes(); _length = a[0].length; break;
            case String: writeString(a[0]); break;
            default: _bytes = new Uint8Array(a[0]); _length = _bytes.length; break;
            }
            break;
        case 2: _bytes = new Uint8Array(a[0], a[1]); _length = a[1]; break;
        case 3: _bytes = new Uint8Array(a[0], a[1], a[2]); _length = a[2]; break;
        }
        mark();
    }

    return Object.create(BytesIO.prototype, {
        length: { get : length },
        capacity: { get : capacity },
        position: { get : position },
        bytes: { get : bytes },
        mark: { value: mark },
        reset: { value: reset },
        clear: { value: clear },
        writeByte: { value: writeByte },
        write: { value: write },
        writeAsciiString: { value: writeAsciiString },
        writeString: { value: writeString },
        readByte: { value: readByte },
        read: { value: read },
        skip: { value: skip },
        readBytes: { value: readBytes },
        readUntil: { value: readUntil },
        readAsciiString: { value: readAsciiString },
        readString: { value: readString },
        takeBytes: { value: takeBytes },
        toBytes: { value: toBytes },
        toBuffer: { value: toBuffer },
        toString: { value: toString },
        clone: { value: clone },
        trunc: { value: trunc }
    });
}

function toString(data) {
    if (data.length === 0) return '';
    if (data.constructor === String) {
        return data;
    }
    if (data.constructor === BytesIO) {
        data = data.bytes;
    }
    if (data.constructor === ArrayBuffer) {
        data = new Uint8Array(data);
    }
    if (data.constructor === Uint8Array) {
        return getUTF8String(data, data.length)[0];
    }
    return String.fromCharCode.apply(String, data);
}

Object.defineProperty(BytesIO, 'toString', { value: toString });

global.hprose.BytesIO = BytesIO;
