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
 * HproseTcpClient.js                                     *
 *                                                        *
 * HproseTcpClient for Node.js.                           *
 *                                                        *
 * LastModified: Oct 24, 2014                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');
var net = require('net');
var tls = require('tls');
var parse = require('url').parse;

var HproseException = require('../common/HproseException.js');
var HproseClient = require('./HproseClient.js');
var HproseTags = require('../io/HproseTags.js');
var serialize = require('../io/HproseFormatter.js').serialize;

function HproseTcpClient(url) {
    if (this.constructor !== HproseTcpClient) return new HproseTcpClient(url);
    HproseClient.call(this);
    var m_options;
    var m_tcp;
    var m_secure;
    var m_clients;
    var m_noDelay = true;
    var super_useService = this.useService;
    if (url) useService(url);

    function useService(url) {
        m_clients = [];
        if (url === undefined) return super_useService();
        var u = parse(url);
        if (u.protocol === 'tcp:') {
            m_tcp = net;
            m_secure = false;
        }
        else if (u.protocol === 'tcps:' ||
                 u.protocol === 'tls:') {
            m_tcp = tls;
            m_secure = true;
        }
        else {
            throw new HproseException('Unsupported protocol!');
        }
        m_options = {host: u.hostname, port: parseInt(u.port) };
        return super_useService();
    }

    function setOption(option, value) {
        m_options[option] = value;
    }

    function setNoDelay(noDelay) {
        if (noDelay === undefined) noDelay = true;
        m_noDelay = noDelay;
    }

    function errorHandler(message, callback) {
        var buffer = new HproseBufferOutputStream();
        buffer.write(HproseTags.TagError);
        buffer.write(serialize(message, true));
        buffer.write(HproseTags.TagEnd);
        callback(buffer.toBuffer());
    }

    function clearEvent(client) {
        client.removeAllListeners('data');
        client.removeAllListeners('error');
        client.removeAllListeners('timeout');        
    }

    function receive(client, callback) {
        var bufferList = [];
        var bufferLength = 0;
        var dataLength = -1;
        client.on('data', function(chunk) {
            bufferList.push(chunk);
            bufferLength += chunk.length;
            if (dataLength < 0 && bufferLength >= 4) {
                var buf = Buffer.concat(bufferList, bufferLength);
                dataLength = buf.readUInt32BE(0);
                bufferList = [buf.slice(4, bufferLength)];
                bufferLength -= 4;
            }
            if (dataLength === bufferLength) {
                clearEvent(client);
                client.unref();
                m_clients.push(client);
                callback(Buffer.concat(bufferList, bufferLength), true);
            }
        });
    }

    function send(client, data) {
        var b = new Buffer(4);
        b.writeUInt32BE(data.length, 0);
        client.write(b);
        client.write(data);
    }

    // private methods
    this.__send__ = function(data, callback) {
        var client;
        if (m_clients.length === 0) {
            client = m_tcp.connect(m_options, function() {
                send(client, data);
            });
            client.setNoDelay(m_noDelay);
            client.setKeepAlive(true);
            receive(client, callback);
        }
        else {
            client = m_clients.pop();
            client.ref();
            receive(client, callback);
            send(client, data);
        }
        client.on('error', function(e) {
            clearEvent(client);
            errorHandler(e.toString(), callback);
        });
        client.setTimeout(this.getTimeout(), function(e) {
            clearEvent(client);
            client.destroy();
            errorHandler('timeout', callback);
        });
    };

    // public methods
    this.useService = useService;
    this.setOption = setOption;
    this.setNoDelay = setNoDelay;

}

util.inherits(HproseTcpClient, HproseClient);

module.exports = HproseTcpClient;