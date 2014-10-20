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
 * HproseClient.js                                        *
 *                                                        *
 * HproseClient for Node.js.                              *
 *                                                        *
 * LastModified: Oct 20, 2014                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
/*global Proxy */
'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;
var HproseResultMode = require('../common/HproseResultMode.js');
var HproseException = require('../common/HproseException.js');
var HproseBufferInputStream = require('../io/HproseBufferInputStream.js');
var HproseBufferOutputStream = require('../io/HproseBufferOutputStream.js');
var HproseReader = require('../io/HproseReader.js');
var HproseWriter = require('../io/HproseWriter.js');
var HproseTags = require('../io/HproseTags.js');

var s_boolean = 'boolean';
var s_number = 'number';
var s_function = 'function';
var s_OnError = '_OnError';
var s_onError = '_onError';
var s_onerror = '_onerror';
var s_Callback = '_Callback';
var s_callback = '_callback';
var s_OnSuccess = '_OnSuccess';
var s_onSuccess = '_onSuccess';
var s_onsuccess = '_onsuccess';

function HproseProxy(invoke, ns) {
    this.get = function(proxy, name) {
        if (ns) name = ns + '_' + name;
        return Proxy.createFunction(
            new HproseProxy(invoke, name),
            function () {
                var args = Array.prototype.slice.call(arguments);
                return invoke(name, args);
            }
        );
    };
}

function HproseClient() {
    EventEmitter.call(this);
    var self = this;
    var m_byref = false;
    var m_simple = false;
    var m_timeout = 30000;
    var m_proxy;
    var m_filters = [];
    var m_batch = false;
    var m_batches = [];

    if (typeof(Proxy) !== 'undefined') m_proxy = Proxy.create(new HproseProxy(invoke));

    function sendAndReceive(request, callback) {
        var context = {client: self, userdata: {}}
        for (var i = 0, n = m_filters.length; i < n; i++) {
            request = m_filters[i].outputFilter(request, context);
        }
        self.__send__(request, function(response, needToFilter) {
            if (needToFilter) {
                for (var i = m_filters.length - 1; i >= 0; i--) {
                    response = m_filters[i].inputFilter(response, context);
                }
            }
            callback(response);
        });
    }

    function invoke(func, args) {
        var resultMode = HproseResultMode.Normal, stream;
        if (!m_batch && !m_batches.length || m_batch) {
            var byref = m_byref;
            var simple = m_simple;
            var lowerCaseFunc = func.toLowerCase();
            var errorHandler = self[func + s_OnError] ||
                               self[func + s_onError] ||
                               self[func + s_onerror] ||
                               self[lowerCaseFunc + s_OnError] ||
                               self[lowerCaseFunc + s_onError] ||
                               self[lowerCaseFunc + s_onerror];
            var callback = self[func + s_Callback] ||
                           self[func + s_callback] ||
                           self[func + s_OnSuccess] ||
                           self[func + s_onSuccess] ||
                           self[func + s_onsuccess] ||
                           self[lowerCaseFunc + s_Callback] ||
                           self[lowerCaseFunc + s_callback] ||
                           self[lowerCaseFunc + s_OnSuccess] ||
                           self[lowerCaseFunc + s_onSuccess] ||
                           self[lowerCaseFunc + s_onsuccess];
            var count = args.length;
            var tArg5 = typeof(args[count - 5]);
            var tArg4 = typeof(args[count - 4]);
            var tArg3 = typeof(args[count - 3]);
            var tArg2 = typeof(args[count - 2]);
            var tArg1 = typeof(args[count - 1]);
            if (tArg1 === s_boolean &&
                tArg2 === s_number &&
                tArg3 === s_boolean &&
                tArg4 === s_function &&
                tArg5 === s_function) {
                simple = args[count - 1];
                resultMode = args[count - 2];
                byref = args[count - 3];
                errorHandler = args[count - 4];
                callback = args[count - 5];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                delete args[count - 4];
                delete args[count - 5];
                args.length -= 5;
            }
            else if (tArg1 === s_boolean &&
                     tArg2 === s_number &&
                     tArg3 === s_function &&
                     tArg4 === s_function) {
                simple = args[count - 1];
                resultMode = args[count - 2];
                errorHandler = args[count - 3];
                callback = args[count - 4];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                delete args[count - 4];
                args.length -= 4;
            }
            else if (tArg1 === s_number &&
                     tArg2 === s_boolean &&
                     tArg3 === s_function &&
                     tArg4 === s_function) {
                resultMode = args[count - 1];
                byref = args[count - 2];
                errorHandler = args[count - 3];
                callback = args[count - 4];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                delete args[count - 4];
                args.length -= 4;
            }
            else if (tArg1 === s_boolean &&
                     tArg2 === s_boolean &&
                     tArg3 === s_function &&
                     tArg4 === s_function) {
                simple = args[count - 1];
                byref = args[count - 2];
                errorHandler = args[count - 3];
                callback = args[count - 4];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                delete args[count - 4];
                args.length -= 4;
            }
            else if (tArg1 === s_boolean &&
                     tArg2 === s_function &&
                     tArg3 === s_function) {
                byref = args[count - 1];
                errorHandler = args[count - 2];
                callback = args[count - 3];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                args.length -= 3;
            }
            else if (tArg1 === s_number &&
                     tArg2 === s_function &&
                     tArg3 === s_function) {
                resultMode = args[count - 1];
                errorHandler = args[count - 2];
                callback = args[count - 3];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                args.length -= 3;
            }
            else if (tArg1 === s_function &&
                     tArg2 === s_function) {
                errorHandler = args[count - 1];
                callback = args[count - 2];
                delete args[count - 1];
                delete args[count - 2];
                args.length -= 2;
            }
            else if (tArg1 === s_boolean &&
                     tArg2 === s_number &&
                     tArg3 === s_boolean &&
                     tArg4 === s_function) {
                simple = args[count - 1];
                resultMode = args[count - 2];
                byref = args[count - 3];
                callback = args[count - 4];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                delete args[count - 4];
                args.length -= 4;
            }
            else if (tArg1 === s_boolean &&
                     tArg2 === s_number &&
                     tArg3 === s_function) {
                simple = args[count - 1];
                resultMode = args[count - 2];
                callback = args[count - 3];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                args.length -= 3;
            }
            else if (tArg1 === s_number &&
                     tArg2 === s_boolean &&
                     tArg3 === s_function) {
                resultMode = args[count - 1];
                byref = args[count - 2];
                callback = args[count - 3];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                args.length -= 3;
            }
            else if (tArg1 === s_boolean &&
                     tArg2 === s_boolean &&
                     tArg3 === s_function) {
                simple = args[count - 1];
                byref = args[count - 2];
                callback = args[count - 3];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                args.length -= 3;
            }
            else if (tArg1 === s_boolean &&
                     tArg2 === s_function) {
                byref = args[count - 1];
                callback = args[count - 2];
                delete args[count - 1];
                delete args[count - 2];
                args.length -= 2;
            }
            else if (tArg1 === s_number &&
                     tArg2 === s_function) {
                resultMode = args[count - 1];
                callback = args[count - 2];
                delete args[count - 1];
                delete args[count - 2];
                args.length -= 2;
            }
            else if (tArg1 === s_function) {
                callback = args[count - 1];
                delete args[count - 1];
                args.length--;
            }
            stream = new HproseBufferOutputStream(HproseTags.TagCall);
            var writer = new HproseWriter(stream, simple);
            writer.writeString(func);
            if (args.length > 0 || byref) {
                writer.reset();
                writer.writeList(args);
                if (byref) {
                    writer.writeBoolean(true);
                }
            }
            if (m_batch) {
                m_batches.push({args: args,
                                func: func,
                                data: stream.toBuffer(),
                                callback: callback,
                                errorHandler: errorHandler});
            }
            else {
                stream.write(HproseTags.TagEnd);
            }
        }

        if (!m_batch) {
            var batchSize = m_batches.length;
            var batch = !!batchSize;
            var request;
            if (batch) {
                request = new HproseBufferOutputStream();
                for (var i = 0; i < batchSize; ++i) {
                    request.write(m_batches[i].data);
                    delete m_batches[i].data;
                }
                request.write(HproseTags.TagEnd);
            }
            else {
                request = stream;
            }

            var batches = m_batches.slice(0);
            m_batches.length = 0;

            sendAndReceive(request.toBuffer(), function(data) {
                var result = null;
                var error = null;
                var i;
                if (resultMode === HproseResultMode.RawWithEndTag) {
                    result = data;
                }
                else if (resultMode === HproseResultMode.Raw) {
                    result = data.slice(0, data.length - 1);
                }
                else {
                    var stream = new HproseBufferInputStream(data);
                    var reader = new HproseReader(stream, false, self.useHarmonyMap);
                    var tag;
                    i = -1;
                    try {
                        while ((tag = stream.getc()) !== HproseTags.TagEnd) {
                            switch (tag) {
                            case HproseTags.TagResult:
                                if (resultMode === HproseResultMode.Serialized) {
                                    result = reader.readRaw().toBuffer();
                                }
                                else {
                                    reader.reset();
                                    result = reader.unserialize();
                                }
                                if (batch) {
                                    batches[++i].result = result;
                                    batches[i].error = null;
                                }
                                break;
                            case HproseTags.TagArgument:
                                reader.reset();
                                args = reader.readList();
                                if (batch) {
                                    batches[i].args = args;
                                }
                                break;
                            case HproseTags.TagError:
                                reader.reset();
                                error = new HproseException(reader.readString());
                                if (batch) {
                                    batches[++i].error = error;
                                }
                                break;
                            default:
                                error = new HproseException('Wrong Response:\r\n' + data.toString());
                                if (batch) {
                                    batches[++i].error = error;
                                }
                                break;
                            }
                        }
                    }
                    catch (e) {
                        error = e;
                        if (batch) {
                            batches[i < 0 ? 0 : i >= batchSize ? i - 1 : i].error = error;
                        }
                    }
                }

                if (!batch) {
                    batchSize = 1;
                    batches = [{args: args,
                                func: func,
                                callback: callback,
                                errorHandler: errorHandler,
                                result: result,
                                error: error}];
                }
                for (i = 0; i < batchSize; ++i) {
                    var item = batches[i];
                    if (item.error) {
                        if (item.errorHandler) {
                            item.errorHandler(item.func, item.error);
                        }
                        else {
                            self.emit('error', item.func, item.error);
                        }
                    }
                    else if (item.callback) {
                        item.callback(item.result, item.args);
                    }
                }
            });
        }
    }

    // public methods
    this.setTimeout = function(value) {
        m_timeout = value;
    };
    this.getTimeout = function() {
        return m_timeout;
    };
    this.invoke = function() {
        var args = arguments;
        var func = Array.prototype.shift.apply(args);
        return invoke(func, args);
    };
    this.useService = function() {
        return m_proxy;
    };
    this.getByRef = function() {
        return m_byref;
    };
    this.setByRef = function(value) {
        if (value === undefined) value = true;
        m_byref = value;
    };
    this.getFilter = function () {
        if (m_filters.length === 0) {
            return null;
        }
        return m_filters[0];
    };
    this.setFilter = function (filter) {
        m_filters.length = 0;
        if (filter !== undefined && filter !== null) {
            m_filters.push(filter);
        }
    };
    this.addFilter = function (filter) {
        m_filters.push(filter);
    };
    this.removeFilter = function (filter) {
        var i = m_filters.indexOf(filter);
        if (i === -1) {
            return false;
        }
        m_filters.splice(i, 1);
        return true;
    };
    this.getSimpleMode = function() {
        return m_simple;
    };
    this.setSimpleMode = function(value) {
        if (value === undefined) value = true;
        m_simple = value;
    };
    this.beginBatch = function() {
        if(!m_batch) {
            m_batch = true;
        }
    };
    this.endBatch = function() {
        m_batch = false;
        if (m_batches.length) {
            invoke();
        }
    };
    this.useHarmonyMap = false;
}

util.inherits(HproseClient, EventEmitter);

module.exports = HproseClient;