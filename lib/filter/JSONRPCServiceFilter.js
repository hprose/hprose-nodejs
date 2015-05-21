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
 * hprose/filter/JSONRPCServiceFilter.js                  *
 *                                                        *
 * jsonrpc service filter for Node.js.                    *
 *                                                        *
 * LastModified: May 21, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var Tags = global.hprose.Tags;
var BytesIO = global.hprose.BytesIO;
var Writer = global.hprose.Writer;
var Reader = global.hprose.Reader;

var leftbrace   = 0x7B; //  '{'
var leftbracket = 0x5B; //  '['

function JSONRPCServiceFilter() {}

JSONRPCServiceFilter.prototype.inputFilter = function inputFilter(data, context) {
    if (data.length > 0) {
        if (data[0] === leftbracket || data[0] === leftbrace) {
            var json = BytesIO.toString(data);
            if (json.charAt(0) === '{') {
                json = '[' + json + ']';
            }
            var requests;
            try {
                requests = JSON.parse(json);
            }
            catch (e) {
                return data;
            }
            var bytes = new BytesIO();
            var writer = new Writer(bytes, true);
            context.userdata.jsonrpc = [];
            for (var i = 0, n = requests.length; i < n; ++i) {
                var jsonrpc = {};
                var request = requests[i];
                if (request.id === undefined) {
                    jsonrpc.id = null;
                }
                else {
                    jsonrpc.id = request.id;
                }
                if (request.version) {
                    jsonrpc.version = request.version;
                }
                else if (request.jsonrpc) {
                    jsonrpc.version = request.jsonrpc;
                }
                else {
                    jsonrpc.version = '1.0';
                }
                context.userdata.jsonrpc[i] = jsonrpc;
                if (request.method) {
                    bytes.writeByte(Tags.TagCall);
                    writer.writeString(request.method);
                    if (request.params && request.params.length > 0) {
                        writer.writeList(request.params);
                    }
                }
            }
            bytes.writeByte(Tags.TagEnd);
            data = bytes.bytes;
        }
    }
    return data;
};

JSONRPCServiceFilter.prototype.outputFilter = function outputFilter(data, context) {
    if (context.userdata.jsonrpc) {
        var jsonrpc = context.userdata.jsonrpc;
        var responses = [];
        var stream = new BytesIO(data);
        var reader = new Reader(stream, false, false);
        var tag = stream.readByte();
        var i = 0;
        do {
            var response = {};
            var version = jsonrpc[i].version;
            if (version !== '2.0') {
                if (version === '1.1') {
                    response.version = '1.1';
                }
                response.result = null;
                response.error = null;
            }
            else {
                response.jsonrpc = '2.0';
            }
            response.id = jsonrpc[i].id;
            if (tag === Tags.TagResult) {
                reader.reset();
                response.result = reader.unserialize();
                tag = stream.readByte();
            }
            else if (tag === Tags.TagError) {
                reader.reset();
                response.error = {
                    code: -1,
                    message: reader.readString()
                };
                tag = stream.readByte();
            }
            responses[i++] = response;
        } while (tag !== Tags.TagEnd);
        if (responses.length === 1) {
            responses = responses[0];
        }
        data = JSON.stringify(responses);
    }
    return data;
};

global.hprose.JSONRPCServiceFilter = JSONRPCServiceFilter;
