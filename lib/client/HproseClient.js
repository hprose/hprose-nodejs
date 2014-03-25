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
 * HproseClient.js                                        *
 *                                                        *
 * HproseClient for Node.js.                              *
 *                                                        *
 * LastModified: Mar 25, 2014                             *
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
    if (typeof(Proxy) !== 'undefined') m_proxy = Proxy.create(new HproseProxy(invoke));

    function invoke(func, args) {
        var resultMode = HproseResultMode.Normal;
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
        var stream = new HproseBufferOutputStream(HproseTags.TagCall);
        var writer = new HproseWriter(stream, simple);
        writer.writeString(func);
        if (args.length > 0 || byref) {
            writer.reset();
            writer.writeList(args);
            if (byref) {
                writer.writeBoolean(true);
            }
        }
        stream.write(HproseTags.TagEnd);
        var invoker = new EventEmitter();
        invoker.on('getdata', function(data) {
            try {
                var result = getResult(data, func, args, resultMode);
                if (callback) callback(result, args);
            }
            catch (e) {
                invoker.emit('error', e);
            }
        });
        invoker.on('error', function(e) {
            if (errorHandler) {
                errorHandler(func, e);
            }
            else {
                self.emit('error', func, e);
            }
        });
        var data = stream.toBuffer();
        for (var i = 0, n = m_filters.length; i < n; i++) {
            data = m_filters[i].outputFilter(data, self);
        }
        self.emit('senddata', invoker, data);
    }

    function getResult(data, func, args, resultMode) {
        for (var i = m_filters.length - 1; i >= 0; i--) {
            data = m_filters[i].inputFilter(data, self);
        }
        var result;
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
            var error;
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
                    break;
                case HproseTags.TagArgument:
                    reader.reset();
                    var a = reader.readList();
                    for (i = 0; i < a.length; i++) {
                        args[i] = a[i];
                    }
                    break;
                case HproseTags.TagError:
                    reader.reset();
                    error = new HproseException(reader.readString());
                    break;
                default:
                    error = new HproseException('Wrong Response:\r\n' + data.toString());
                    break;
                }
            }
            if (error) throw error;
        }
        return result;
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
        return invoke(this, func, args);
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
    this.useHarmonyMap = false;
}

util.inherits(HproseClient, EventEmitter);

module.exports = HproseClient;