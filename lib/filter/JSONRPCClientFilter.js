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
 * hprose/filter/JSONRPCClientFilter.js                   *
 *                                                        *
 * jsonrpc client filter for Node.js.                     *
 *                                                        *
 * LastModified: Jul 17, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var Tags = global.hprose.Tags;
var BytesIO = global.hprose.BytesIO;
var Writer = global.hprose.Writer;
var Reader = global.hprose.Reader;

var s_id = 1;

function JSONRPCClientFilter(version) {
    this.version = version || '2.0';
}

JSONRPCClientFilter.prototype.inputFilter = function inputFilter(data, context) {
    var json = BytesIO.toString(data);
    if (json.charAt(0) === '{') {
        json = '[' + json + ']';
    }
    var responses = JSON.parse(json);
    var stream = new BytesIO();
    var writer = new Writer(stream, true);
    for (var i = 0, n = responses.length; i < n; ++i) {
        var response = responses[i];
        if (response.error) {
            stream.writeByte(Tags.TagError);
            writer.writeString(response.error.message);
        }
        else {
            stream.writeByte(Tags.TagResult);
            writer.serialize(response.result);
        }
    }
    stream.writeByte(Tags.TagEnd);
    return stream.bytes;
};

JSONRPCClientFilter.prototype.outputFilter = function outputFilter(data, context) {
    var requests = [];
    var stream = new BytesIO(data);
    var reader = new Reader(stream, false, false);
    var tag = stream.readByte();
    do {
        var request = {};
        if (tag === Tags.TagCall) {
            request.method = reader.readString();
            tag = stream.readByte();
            if (tag === Tags.TagList) {
                request.params = reader.readListWithoutTag();
                tag = stream.readByte();
            }
            if (tag === Tags.TagTrue) {
                tag = stream.readByte();
            }
        }
        if (this.version === '1.1') {
            request.version = '1.1';
        }
        else if (this.version === '2.0') {
            request.jsonrpc = '2.0';
        }
        request.id = s_id++;
        requests.push(request);
    } while (tag === Tags.TagCall);
    if (requests.length > 1) {
        return JSON.stringify(requests);
    }
    return JSON.stringify(requests[0]);
};

global.hprose.JSONRPCClientFilter = JSONRPCClientFilter;
