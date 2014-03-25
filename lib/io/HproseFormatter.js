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
 * HproseFormatter.js                                     *
 *                                                        *
 * HproseFormatter for Node.js.                           *
 *                                                        *
 * LastModified: Feb 25, 2014                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var HproseBufferInputStream = require('./HproseBufferInputStream.js');
var HproseBufferOutputStream = require('./HproseBufferOutputStream.js');
var HproseReader = require('./HproseReader.js');
var HproseWriter = require('./HproseWriter.js');

var HproseFormatter = {
    serialize: function(variable, simple) {
        var stream = new HproseBufferOutputStream();
        var hproseWriter = new HproseWriter(stream, simple);
        hproseWriter.serialize(variable);
        return stream.toBuffer();
    },
    unserialize: function(variable_representation, simple, useHarmonyMap) {
        var stream = new HproseBufferInputStream(variable_representation);
        var hproseReader = new HproseReader(stream, simple, useHarmonyMap);
        return hproseReader.unserialize();
    }
};

module.exports = HproseFormatter;