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
 * hprose/io/Formatter.js                                 *
 *                                                        *
 * Hprose Formatter for Node.js.                          *
 *                                                        *
 * LastModified: May 15, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var BytesIO = global.hprose.BytesIO;
var Writer = global.hprose.Writer;
var Reader = global.hprose.Reader;

function serialize(value, simple) {
    var stream = new BytesIO();
    var writer = new Writer(stream, simple);
    writer.serialize(value);
    return stream;
}

function unserialize(stream, simple, useHarmonyMap) {
    if (!(stream instanceof BytesIO)) {
        stream = new BytesIO(stream);
    }
    return new Reader(stream, simple, useHarmonyMap).unserialize();
}

global.hprose.Formatter = {
    serialize: function (value, simple) {
        return serialize(value, simple).bytes;
    },
    unserialize: unserialize
};

global.hprose.serialize = serialize;

global.hprose.unserialize = unserialize;
