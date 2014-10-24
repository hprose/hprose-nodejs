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
 * HproseTcpService.js                                    *
 *                                                        *
 * HproseTcpService for Node.js.                          *
 *                                                        *
 * LastModified: Oct 24, 2014                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var fs = require('fs');
var util = require('util');
var HproseService = require('./HproseService.js');

function HproseTcpService() {
    var m_timeout = 120000;

    HproseService.call(this);

    // public methods

    this.getTimeout = function() {
        return m_timeout;
    };

    this.setTimeout = function(timeout) {
        m_timeout = timeout;
    };

    this.handle = function(conn) {
        var context = {
            userdata: {},
            conn: conn,
            __send__: function(data) {
                var b = new Buffer(4);
                b.writeUInt32BE(data.length, 0);
                conn.write(b);
                conn.write(data);
            }
        };
        conn.setTimeout(m_timeout);
        var bufferList = [];
        var bufferLength = 0;
        var dataLength = -1;
        conn.on('data', function(chunk) {
            bufferList.push(chunk);
            bufferLength += chunk.length;
            if (dataLength < 0 && bufferLength >= 4) {
                var buf = Buffer.concat(bufferList, bufferLength);
                dataLength = buf.readUInt32BE(0);
                bufferList = [buf.slice(4, bufferLength)];
                bufferLength -= 4;
            }
            if (dataLength === bufferLength) {
                var data = Buffer.concat(bufferList, bufferLength);
                bufferList = [];
                bufferLength = 0;
                dataLength = -1;
                this._handle(data, context);
            }
        }.bind(this));
        conn.on('end', function(e) { });
        conn.on('error', function(e) { });
    };
}

util.inherits(HproseTcpService, HproseService);

module.exports = HproseTcpService;